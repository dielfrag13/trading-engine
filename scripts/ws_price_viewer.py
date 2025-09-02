#!/usr/bin/env python3
import argparse
import asyncio
import json
import sys
import threading
import queue
from datetime import datetime, timezone
from zoneinfo import ZoneInfo  # <— NEW

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
                    help="Plot every Nth point (for huge streams). 1 = plot all.")
    ap.add_argument("--tz", default="America/New_York",  # <— NEW
                    help="Target timezone for display (e.g., America/New_York, UTC)")
    return ap.parse_args()

def _iso_to_dt(s: str) -> datetime:
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)  # keep tzinfo from string
    except Exception:
        # Fallback; assume UTC
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S%z")

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

# ---- CHANGED: now converts to target tz before appending
def _append_point(mode: str, msg: dict, times, prices, target_tz) -> bool:
    if mode == "secbar":
        ts = msg.get("ts")
        close = msg.get("close")
        if ts is None or close is None:
            return False
        dt_utc = _iso_to_dt(ts)  # already aware
        dt_local = dt_utc.astimezone(target_tz)
        times.append(dt_local)
        prices.append(float(close))
        return True
    else:  # tick
        t = msg.get("time")
        p = msg.get("price")
        if t is None or p is None:
            return False
        dt_utc = _tick_to_dt(float(t))
        dt_local = dt_utc.astimezone(target_tz)
        times.append(dt_local)
        prices.append(float(p))
        return True

def _live_plot_loop(args, q: queue.Queue, stop_evt: threading.Event):
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter, AutoDateLocator

    tz = _get_tz(args.tz)  # <— NEW

    plt.ion()
    fig, ax = plt.subplots()
    ax.set_title(args.title)
    ax.set_xlabel(f"Time ({args.tz})")  # updated when first point arrives
    ax.set_ylabel("Price")
    locator = AutoDateLocator()
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(DateFormatter("%H:%M:%S"))

    date_text = fig.text(0.99, 0.98, "", ha="right", va="top")  # <— NEW

    times, prices = [], []
    line, = ax.plot([], [], linewidth=1.0)

    mode = args.mode
    have_labeled_date = False  # <— NEW

    try:
        while not stop_evt.is_set():
            try:
                raw = q.get(timeout=0.05)
            except queue.Empty:
                plt.pause(0.01)
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
            if not _append_point(cur_mode, msg, times, prices, tz):
                continue

            # First point: set axis label with actual tz abbreviation and draw date stamp
            if not have_labeled_date and times:
                tz_abbr = times[0].tzname() or args.tz
                ax.set_xlabel(f"Time ({tz_abbr})")
                date_text.set_text(times[0].strftime("%Y-%m-%d (%a) %Z"))
                have_labeled_date = True

            if args.downsample > 1 and (len(times) % args.downsample != 0):
                continue

            line.set_data(times, prices)
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

    tz = _get_tz(args.tz)  # <— NEW

    times, prices = [], []
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
            _append_point(cur_mode, msg, times, prices, tz)
    except KeyboardInterrupt:
        pass

    if not times:
        print("[!] no data collected; nothing to plot")
        return

    fig, ax = plt.subplots()
    ax.set_title(args.title)
    tz_abbr = times[0].tzname() or args.tz
    ax.set_xlabel(f"Time ({tz_abbr})")  # <— NEW
    ax.set_ylabel("Price")
    locator = AutoDateLocator()
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(DateFormatter("%H:%M:%S"))
    ax.plot(times, prices, linewidth=1.0)
    ax.relim()
    ax.autoscale_view()

    # Date label in the corner
    fig.text(0.99, 0.98, times[0].strftime("%Y-%m-%d (%a) %Z"),
             ha="right", va="top")  # <— NEW

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
