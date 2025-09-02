# Kraken Day Capture

ChatGPT really did a thing here.

Example on how to gather trades:

```
python kraken_day_capture.py \
  --pair XBTUSD \
  --date 2025-08-28 \
  --out trades_2025-08-28_XBTUSD.jsonl.gz \
  --parquet trades_2025-08-28_XBTUSD.parquet \
  --sec-bars secbars_2025-08-28_XBTUSD.parquet
```

that emits a zipped file. This can then be used in a variety of ways:


### quick one-liner that previews the first 5 seconds
```
python -c "import itertools; from kraken_day_capture import load_jsonl_gz_to_df, replay_trades_by_second; df=load_jsonl_gz_to_df('trades_2025-08-28_BTCUSD.jsonl.gz'); \
[print(ts.isoformat(), len(frame), 'trades') for ts,frame in itertools.islice(replay_trades_by_second(df), 5)]"
```

### per second bars, real time pacing
```
python kraken_day_capture.py --replay trades_2025-08-28_BTCUSD.jsonl.gz
```

### per second barts, 10x faster

```
python kraken_day_capture.py --replay trades_2025-08-28_BTCUSD.jsonl.gz --pace 10
```


### raw ticks, 5x faster
```
python kraken_day_capture.py --replay trades_2025-08-28_BTCUSD.jsonl.gz --ticks --pace 5
```

### filter to a pair (if the file mixes pairs, which i don't think this does yet)
```
python kraken_day_capture.py --replay mixed.jsonl.gz --symbol XBTUSD
```


# WebSocket price viewer

This will connect to a websocket server from kraken day viewer and draw a graph of the replay.

Live replay:
```bash
python ws_price_viewer.py --url ws://127.0.0.1:8765 --live --title "BTCUSD – replay" --tz America/New_York
```

Headless PNG generation:
```
python ws_price_viewer.py --url ws://127.0.0.1:8765 --out btc_day.png --title "BTCUSD – day" --tz America/New_York
```

