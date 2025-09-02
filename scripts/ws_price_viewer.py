#!/usr/bin/env python3
import argparse
import asyncio
import json
import sys
import threading
import queue
import time
from collections import deque
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

def _maybe_set_backend(live: bool):
    if not live:
        import matplotlib
        matplotlib.use("Agg")

def _parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://127.0.0.1:8765", help="WebSocket URL")
    ap.add_argument("--live", action="store_true", help="Show a live-updating chart")
    ap.add_argument("--out", help="Write final PNG to this path (headless if not --live)")
    ap.add_argument("--mode", choices=["auto", "secbar", "tick"], default="auto",
                    help="How to interpret inbound messages")
    ap.add_argument("--symbol", help="Optional pair filter (e.g., BTCUSD or XBTUSD)")
    ap.add_argument("--title", default="Price", help="Plot title")
    ap.add_argument("--downsample", type=int, default=1,
                    help="Only attempt a redraw every Nth accepted message")
    ap.add_argument("--tz", default="America/New_York",
                    help="Target timezone (e.g., America/New_York, UTC)")

    # NEW: perf & visuals
    ap.add_argument("--fps", type=float, default=20.0,
                    help="Max redraws per second (live mode)")
    ap.add_argument("--max-points", type=int, default=20000,
                    help="Cap the number of plotted points (live mode)")
    ap.add_argument("--agg-sec", type=int, default=0,
                    help="Aggregate to N-second buckets (0 = no aggregation)")
    ap.add_argument("--grid", dest="grid", action="store_true", default=True,
                    help="Show subtle vertical grid (default)")
    ap.add_argument("--no-grid", dest="grid", action="store_false")
    ap.add_argument("--midnight-line", dest="midnight_line", action="store_true", default=True,
                    help="Draw a vertical line at local midnight (default)")
    ap.add_argument("--no-midnight-line", dest="midnight_line", action="store_false")
    return ap.parse_args()

def _iso_to_dt(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)

def _tick_to_dt(ts_float: float) -> datetime:
    return datetime.fromtimestamp(float(ts_float), tz=timezone.utc)

def _get_tz(name: str):
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc

async def _ws_reader(url: str, q: queue.Queue, stop_evt: threading.Event):
    import websockets
    try:
        async with websockets.connect(url, max_size=None) as ws:
            async for msg in ws:
                if stop_evt.is_set():
                    break
                q.put(msg)
    except Exception as e:
        q.put(json.dumps({"__error__": str(e)}))

def _start_reader_thread(url: str, q: queue.Queue, stop_evt: threading.Event) -> threading.Thread:
    def runner():
        try:
            asyncio.run(_ws_reader(url, q, stop_evt))
        except Exception as e:
            q.put(json.dumps({"__error__": str(e)}))
    t = threading.Thread(target=runner, daemon=True)
    t.start()
    return t

def _filter_symbol(msg: dict, symbol: str) -> bool:
    if not symbol:
        return True
    pair = msg.get("pair") or msg.get("symbol")
    if not pair:
        return True
    norm = str(pair).replace("/", "").upper()
    want = symbol.replace("/", "").upper()
    return norm == want

def _auto_mode_from_message(msg: dict, default="secbar"):
    t = msg.get("type")
    if t in ("secbar", "tick"):
        return t
    if "ts" in msg:
        return "secbar"
    if "time" in msg and "price" in msg:
        return "tick"
    return default

def _append_point(mode: str, msg: dict, tz, agg_sec: int, buf_times, buf_prices):
    """
    Append a point to buffers (deque) after converting to target tz and applying optional aggregation.
    Returns True if a visible point was added/updated.
    """
    if mode == "secbar":
        ts = msg.get("ts"); close = msg.get("close")
        if ts is None or close is None:
            return False
        dt_utc = _iso_to_dt(ts)
        dt_local = dt_utc.astimezone(tz)
        price = float(close)
    else:  # tick
        t = msg.get("time"); p = msg.get("price")
        if t is None or p is None:
            return False
        dt_utc = _tick_to_dt(float(t))
        dt_local = dt_utc.astimezone(tz)
        price = float(p)

    if agg_sec and agg_sec > 0:
        # floor to bucket
        bucket_ts = int(dt_local.timestamp() // agg_sec) * agg_sec
        bucket_dt = datetime.fromtimestamp(bucket_ts, tz=dt_local.tzinfo)
        # If last point is in same bucket, update the last value to avoid growing the array
        if buf_times and buf_times[-1] == bucket_dt:
            buf_prices[-1] = price
            return True
        else:
            buf_times.append(bucket_dt)
            buf_prices.append(price)
            return True
    else:
        buf_times.append(dt_local)
        buf_prices.append(price)
        return True

def _format_range_label(t0: datetime, t1: datetime) -> str:
    if not t0 or not t1:
        return ""
    same_day = (t0.date() == t1.date())
    tz_abbr = (t0.tzname() or "").strip()
    if same_day:
        # 2025-09-01 00:00 — 23:59 EDT
        return f"{t0.strftime('%Y-%m-%d %H:%M:%S')} — {t1.strftime('%H:%M:%S')} {tz_abbr}".strip()
    else:
        # span across days
        return f"{t0.strftime('%Y-%m-%d %H:%M:%S')} — {t1.strftime('%Y-%m-%d %H:%M:%S')} {tz_abbr}".strip()

def _compute_midnights_between(left: datetime, right: datetime):
    """
    Return a list of tz-aware datetimes at local midnight between [left, right].
    """
    if left > right:
        left, right = right, left
    first_midnight = left.replace(hour=0, minute=0, second=0, microsecond=0)
    if first_midnight < left:
        first_midnight = first_midnight + timedelta(days=1)
    mids = []
    cur = first_midnight
    while cur <= right:
        mids.append(cur)
        cur = cur + timedelta(days=1)
    return mids



def _live_plot_loop(args, q: queue.Queue, stop_evt: threading.Event):
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter, AutoDateLocator

    tz = _get_tz(args.tz)

    plt.ion()
    fig, ax = plt.subplots()
    ax.set_title(args.title)
    ax.set_xlabel(f"Time ({args.tz})")
    ax.set_ylabel("Price")

    # TZ-aware ticks
    locator = AutoDateLocator(tz=tz)
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(DateFormatter("%H:%M:%S", tz=tz))

    # Subtle vertical grid
    if args.grid:
        ax.grid(axis="x", which="major", linestyle="--", alpha=0.2)

    # Date label
    #date_text = fig.text(0.99, 0.98, "", ha="right", va="top")
    range_text = fig.text(0.99, 0.95, "", ha="right", va="top")  # NEW: time range



    # Rolling buffers to keep UI snappy
    times = deque(maxlen=max(1000, args.max_points))
    prices = deque(maxlen=max(1000, args.max_points))
    line, = ax.plot([], [], linewidth=1.0)

    mode = args.mode
    have_labeled_date = False
    midnight_lines = []

    # Redraw throttle (FPS)
    min_dt = 1.0 / max(1e-6, args.fps)
    last_draw = 0.0
    count_since_draw = 0

    try:
        while not stop_evt.is_set():
            try:
                raw = q.get(timeout=0.05)
            except queue.Empty:
                # periodic small refresh helps interactivity
                if time.monotonic() - last_draw > min_dt:
                    plt.pause(0.005)
                    last_draw = time.monotonic()
                continue

            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if "__error__" in msg:
                print("[ws] error:", msg["__error__"], file=sys.stderr)
                break

            if not _filter_symbol(msg, args.symbol):
                continue

            cur_mode = _auto_mode_from_message(msg) if mode == "auto" else mode
            if not _append_point(cur_mode, msg, tz, args.agg_sec, times, prices):
                continue

            # Ensure axis spans exactly the data range
            if len(times) >= 2:
                ax.set_xlim(times[0], times[-1])

            # First point: set axis label and initial date text
            if not have_labeled_date and times:
                tz_abbr = times[0].tzname() or args.tz
                ax.set_xlabel(f"Time ({tz_abbr})")
                #date_text.set_text(times[0].strftime("%Y-%m-%d (%a) %Z"))
                have_labeled_date = True

            # Update range label continuously
            if times:
                range_text.set_text(_format_range_label(times[0], times[-1]))

            # Draw/refresh midnight lines across the visible range
            if args.midnight_line and len(times) >= 2:
                needed = _compute_midnights_between(times[0], times[-1])
                # Build a set of existing x-positions to avoid duplicates
                existing = set()
                for ln in midnight_lines:
                    try:
                        xdata = ln.get_xdata()
                        existing.add(xdata[0] if hasattr(xdata, '__iter__') else xdata)
                    except Exception:
                        pass
                # Add any missing midnights
                for m in needed:
                    if m not in existing:
                        midnight_lines.append(ax.axvline(m, linestyle="-", linewidth=1.0, alpha=0.35))

            # Optional extra: move midnight line if the day rolls (unlikely in single-day)
            # if midnight_line and times[-1].date() != times[0].date():
            #     new_m = times[-1].replace(hour=0, minute=0, second=0, microsecond=0)
            #     midnight_line.set_xdata(new_m)

            # Downsample throttle: only attempt redraw every Nth accepted message
            count_since_draw += 1
            if args.downsample > 1 and (count_since_draw % args.downsample != 0):
                continue

            # FPS throttle
            now = time.monotonic()
            if now - last_draw < min_dt:
                continue
            last_draw = now

            # Update visible data (deque → list is cheap, bounded by max_points)
            line.set_data(list(times), list(prices))
            ax.relim()
            ax.autoscale_view()
            fig.canvas.draw_idle()
            plt.pause(0.001)
    except KeyboardInterrupt:
        pass
    finally:
        if args.out:
            fig.savefig(args.out, dpi=150, bbox_inches="tight")
            print(f"[i] saved {args.out} ({len(times)} points)")
        plt.ioff()
        try:
            plt.show()
        except Exception:
            pass

def _headless_collect_and_save(args, q: queue.Queue, stop_evt: threading.Event):
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter, AutoDateLocator

    tz = _get_tz(args.tz)

    # In headless mode we still allow aggregation for faster/smaller plots
    times = []
    prices = []
    mode = args.mode

    try:
        while not stop_evt.is_set():
            try:
                raw = q.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if "__error__" in msg:
                print("[ws] error:", msg["__error__"], file=sys.stderr)
                break
            if not _filter_symbol(msg, args.symbol):
                continue
            cur_mode = _auto_mode_from_message(msg) if mode == "auto" else mode

            # Apply same aggregation rule as live
            if cur_mode == "secbar":
                dt_utc = _iso_to_dt(msg.get("ts"))
                dt_local = dt_utc.astimezone(tz)
                price = float(msg.get("close"))
            else:
                dt_utc = _tick_to_dt(float(msg.get("time")))
                dt_local = dt_utc.astimezone(tz)
                price = float(msg.get("price"))

            if args.agg_sec and args.agg_sec > 0:
                bucket_ts = int(dt_local.timestamp() // args.agg_sec) * args.agg_sec
                bucket_dt = datetime.fromtimestamp(bucket_ts, tz=dt_local.tzinfo)
                if times and times[-1] == bucket_dt:
                    prices[-1] = price
                else:
                    times.append(bucket_dt)
                    prices.append(price)
            else:
                times.append(dt_local)
                prices.append(price)
    except KeyboardInterrupt:
        pass

    if not times:
        print("[!] no data collected; nothing to plot")
        return

    fig, ax = plt.subplots()
    ax.set_title(args.title)
    tz_abbr = times[0].tzname() or args.tz
    ax.set_xlabel(f"Time ({tz_abbr})")
    ax.set_ylabel("Price")

    locator = AutoDateLocator(tz=tz)
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(DateFormatter("%H:%M:%S", tz=tz))

    if args.grid:
        ax.grid(axis="x", which="major", linestyle="--", alpha=0.2)

    # Midnight marker
    if args.midnight_line:
        for m in _compute_midnights_between(times[0], times[-1]):
            ax.axvline(m, linestyle="-", linewidth=1.0, alpha=0.35)

    ax.set_xlim(times[0], times[-1])
    ax.plot(times, prices, linewidth=1.0)
    ax.relim()
    ax.autoscale_view()

    # Date label
    fig.text(0.99, 0.98, times[0].strftime("%Y-%m-%d (%a) %Z"),
             ha="right", va="top")
    fig.text(0.99, 0.95, _format_range_label(times[0], times[-1]),
         ha="right", va="top")

    out = args.out or "price.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    print(f"[i] saved {out} ({len(times)} points)")

def main():
    args = _parse_args()
    _maybe_set_backend(args.live)

    q: queue.Queue[str] = queue.Queue(maxsize=10000)
    stop_evt = threading.Event()
    t = _start_reader_thread(args.url, q, stop_evt)

    try:
        if args.live:
            _live_plot_loop(args, q, stop_evt)
        else:
            _headless_collect_and_save(args, q, stop_evt)
    finally:
        stop_evt.set()
        t.join(timeout=1.0)

if __name__ == "__main__":
    main()
