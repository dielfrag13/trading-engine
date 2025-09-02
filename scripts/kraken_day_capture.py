#!/usr/bin/env python3
"""
Fetch one full UTC day of Kraken trade data and save it.

Usage:
  python kraken_day_capture.py --pair XBTUSD --date 2025-08-28 \
      --out trades_2025-08-28_XBTUSD.jsonl.gz \
      --parquet trades_2025-08-28_XBTUSD.parquet \
      --sec-bars secbars_2025-08-28_XBTUSD.parquet

Notes:
- Date is interpreted in UTC (00:00:00 to 23:59:59).
- Writes raw trades as JSONL (gz). Optional Parquet + per-second OHLCV.
"""

import argparse
import gzip
import json
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

import requests

try:
    import pandas as pd
except Exception:
    pd = None

KRAKEN_API = "https://api.kraken.com/0/public"

# ---- Helpers ----------------------------------------------------------------

def iso_utc_day_bounds(day_str: str) -> Tuple[float, float]:
    """Return (start_ts, end_ts) in UNIX seconds for a UTC day like '2025-08-28'."""
    dt = datetime.strptime(day_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start = dt
    end = dt + timedelta(days=1)
    return start.timestamp(), end.timestamp()

def resolve_pair(session: requests.Session, pair_like: str) -> str:
    """
    Resolve a user-provided pair like 'XBTUSD' or 'BTC/USD' to a Kraken altname.
    Kraken's AssetPairs returns keys (internal) and fields including 'altname' and 'wsname'.
    We return the altname, which is accepted by public endpoints.
    """
    resp = session.get(f"{KRAKEN_API}/AssetPairs", timeout=30)
    resp.raise_for_status()
    data = resp.json()["result"]

    target = pair_like.replace("/", "").upper()
    # First pass: exact altname match
    for _, meta in data.items():
        alt = meta.get("altname", "")
        if alt.upper() == target:
            return alt
    # Second pass: strip slash from wsname
    for _, meta in data.items():
        ws = (meta.get("wsname") or "").replace("/", "")
        alt = meta.get("altname", "")
        if ws.upper() == target:
            return alt
    # Third pass: accept input if it seems valid (Kraken often accepts 'XBTUSD')
    return pair_like

def fetch_trades_for_day(session: requests.Session, pair_alt: str,
                         day_start: float, day_end: float,
                         rate_delay: float = 1.1, verbose=True) -> Iterable[Dict]:
    """
    Iterate all trades for [day_start, day_end) UNIX seconds.
    Uses Kraken pagination via 'since' cursor. Filters to requested window.
    Yields dicts with typed fields for convenience.
    """

    start_ns = int(day_start * 1_000_000_000)
    end_ns   = int(day_end   * 1_000_000_000)

    since = start_ns  # <-- start exactly at the day's beginning (ns)
    max_pages = 200000  # safety
    pages = 0
    last_progress = None

    while pages < max_pages and since < end_ns:
        pages += 1
        params = {"pair": pair_alt, "since": since}  # <-- ALWAYS send 'since'
        r = session.get(f"{KRAKEN_API}/Trades", params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        if j.get("error"):
            raise RuntimeError(f"Kraken error: {j['error']}")

        result = j.get("result", {})
        last = result.get("last")
        # pick the first list value that isn't 'last'
        trades_raw = None
        for k, v in result.items():
            if k != "last" and isinstance(v, list):
                trades_raw = v
                break
        trades_raw = trades_raw or []

        emitted = 0
        last_trade_ts = None
        for row in trades_raw:
            # [price, volume, time, side, ordertype, misc, (optional trade_id)]
            ts = float(row[2])
            last_trade_ts = ts
            if ts < day_start:
                continue
            if ts >= day_end:
                # we've hit/overshot the end of the window, but keep looping once more
                # so that 'since' advances and we can exit cleanly
                continue

            yield {
                "pair": pair_alt,
                "price": float(row[0]),
                "volume": float(row[1]),
                "time": ts,
                "side": row[3],
                "ordertype": row[4],
                "misc": row[5] if len(row) > 5 else "",
            }
            emitted += 1

        # Advance the cursor
        if last is None:
            # No cursor? If we made no progress, bail.
            if last_trade_ts is None:
                break
        else:
            new_since = int(last)
            if new_since <= since:
                # No forward progress; if we've already passed the end or got nothing, stop.
                if last_trade_ts is None or last_trade_ts >= day_end:
                    break
            since = new_since

        if verbose:
            def to_dt(ns): 
                return datetime.fromtimestamp(ns / 1_000_000_000, tz=timezone.utc).isoformat()
            print(f"[i] page={pages} since={since} ({to_dt(since)}) emitted={emitted}", file=sys.stderr)

        time.sleep(rate_delay)

    if verbose:
        print(f"[i] done after {pages} pages (since >= end_ns? {since >= end_ns})", file=sys.stderr)




def write_jsonl_gz(trades_iter: Iterable[Dict], out_path: str) -> int:
    count = 0
    with gzip.open(out_path, "wt", encoding="utf-8") as f:
        for t in trades_iter:
            f.write(json.dumps(t, separators=(",", ":")) + "\n")
            count += 1
    return count

def load_jsonl_gz_to_df(path: str):
    if pd is None:
        raise RuntimeError("pandas not installed; cannot build Parquet/sec-bars.")
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    df = pd.DataFrame(rows)
    if not df.empty:
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df.set_index("datetime", inplace=True)
    return df

def save_parquet(df, path: str):
    if pd is None:
        raise RuntimeError("pandas not installed; cannot write Parquet.")
    try:
        df.to_parquet(path, index=True)
    except Exception as e:
        raise RuntimeError(f"Writing Parquet failed (install pyarrow or fastparquet): {e}")

def make_second_bars(df):
    """
    Build per-second OHLCV from trades.
    close = last price in the second
    volume = sum volume in the second
    vwap, trades count also included.
    """
    if df.empty:
        return df

    # Price series for O/H/L/C
    price = df["price"]
    vol = df["volume"]

    # Aggregate to 1-second bins
    o = price.resample("1S").first().rename("open")
    h = price.resample("1S").max().rename("high")
    l = price.resample("1S").min().rename("low")
    c = price.resample("1S").last().rename("close")
    v = vol.resample("1S").sum().rename("volume")
    n = price.resample("1S").count().rename("trades")

    # VWAP: sum(price*volume) / sum(volume)
    pv = (price * vol).resample("1S").sum()
    vwap = (pv / v.replace(0, pd.NA)).rename("vwap")

    bars = pd.concat([o, h, l, c, v, n, vwap], axis=1)
    return bars

def replay_trades_by_second(df):
    """
    Generator that yields (second_timestamp, trades_df_for_that_second)
    in chronological order—helpful for simulating a live feed.
    """
    if df.empty:
        return
    # Group trades by each second bucket
    for ts, frame in df.groupby(pd.Grouper(freq="1S")):
        if not frame.empty:
            yield ts.to_pydatetime(), frame

# ---- CLI --------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", required=True, help="Kraken market, e.g. XBTUSD or BTC/USD")
    ap.add_argument("--date", required=True, help="UTC date YYYY-MM-DD")
    ap.add_argument("--out", required=True, help="Output raw trades JSONL.GZ")
    ap.add_argument("--parquet", help="Optional: also write raw trades to Parquet")
    ap.add_argument("--sec-bars", help="Optional: write per-second OHLCV Parquet")
    ap.add_argument("--rate-delay", type=float, default=1.1, help="Seconds to sleep between requests")
    args = ap.parse_args()

    start_ts, end_ts = iso_utc_day_bounds(args.date)

    with requests.Session() as s:
        pair_alt = resolve_pair(s, args.pair)
        print(f"[i] Resolved pair: {args.pair} -> {pair_alt}", file=sys.stderr)

        # Stream to JSONL.GZ while fetching
        # We’ll iterate twice: once to write JSONL, then optionally load for parquet/bars.
        trade_stream = fetch_trades_for_day(s, pair_alt, start_ts, end_ts, rate_delay=args.rate_delay)
        count = write_jsonl_gz(trade_stream, args.out)
        print(f"[i] Wrote {count} trades to {args.out}", file=sys.stderr)

    # Optional post-processing
    if args.parquet or args.sec_bars:
        if pd is None:
            print("[!] pandas not installed; skipping Parquet/second-bars.", file=sys.stderr)
            return

        df = load_jsonl_gz_to_df(args.out)

        if args.parquet:
            save_parquet(df, args.parquet)
            print(f"[i] Wrote raw trades Parquet -> {args.parquet}", file=sys.stderr)

        if args.sec_bars:
            bars = make_second_bars(df)
            save_parquet(bars, args.sec_bars)
            print(f"[i] Wrote per-second OHLCV -> {args.sec_bars}", file=sys.stderr)

if __name__ == "__main__":
    main()

