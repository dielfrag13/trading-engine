# Backtest Infrastructure

This directory contains the backtest orchestration system for the trading engine.

## Directory Structure

```
backtest/
├── orchestrator.py      # Main backtest orchestration script
├── data/               # Cached Kraken trade data
│   ├── .index.json     # Index of downloaded dates by symbol
│   ├── BTCUSD/         # Symbol-specific cache
│   │   ├── 2024-01-01.jsonl.gz
│   │   ├── 2024-01-02.jsonl.gz
│   │   └── ...
│   └── ETHUSD/
│       └── ...
└── reports/            # Generated backtest reports
    ├── BTCUSD_20240101_120000.json
    ├── BTCUSD_20240102_120000.json
    └── ...
```

## Usage

### Download Kraken Data

```bash
# Download last 10 days of BTCUSD trades
python backtest/orchestrator.py --symbol BTCUSD --days 10

# Download specific date range
python backtest/orchestrator.py --symbol BTCUSD --start 2024-01-01 --end 2024-01-31

# Force re-download (ignore cache)
python backtest/orchestrator.py --symbol BTCUSD --days 5 --force
```

### Run Backtest

```bash
# Backtest with default strategy (MovingAverage)
python backtest/orchestrator.py --symbol BTCUSD --days 10

# Backtest with specific strategy
python backtest/orchestrator.py --symbol BTCUSD --days 10 --strategy MovingAverage

# Custom output location
python backtest/orchestrator.py --symbol BTCUSD --days 10 --output /tmp/my_report.json
```

## Data Format

### JSONL.GZ Files (Cached Trade Data)

Each `YYYY-MM-DD.jsonl.gz` file contains one Kraken trade per line, compressed with gzip.

Example trade record:
```json
{
  "pair": "BTCUSD",
  "price": 43500.5,
  "volume": 0.123,
  "time": 1704110400.123,
  "side": "buy",
  "ordertype": "market",
  "misc": "m"
}
```

Fields:
- `pair`: Trading pair (e.g., "BTCUSD")
- `price`: Trade price in USD
- `volume`: Trade volume in base currency
- `time`: Unix timestamp with fractional seconds
- `side`: "buy" or "sell"
- `ordertype`: "market" or "limit"
- `misc`: Kraken misc flags ("m"=maker, "M"=missing maker, etc.)

### Report Files (JSON)

Each report summarizes backtest results for a symbol.

Example:
```json
{
  "symbol": "BTCUSD",
  "generated": "2024-01-15T12:00:00",
  "summary": {
    "num_days": 10,
    "total_pnl": 1234.56,
    "total_trades": 47,
    "max_drawdown": -0.05,
    "avg_pnl_per_day": 123.46
  },
  "daily_results": [
    {
      "symbol": "BTCUSD",
      "date": "2024-01-01",
      "strategy": "MovingAverage",
      "data_file": "/path/to/2024-01-01.jsonl.gz",
      "trades": [...],
      "pnl": 100.0,
      "pnl_pct": 0.01,
      "max_drawdown": -0.02,
      "status": "completed"
    },
    ...
  ]
}
```

## Integration with C++ Engine

The backtest orchestrator:

1. **Downloads** Kraken trades via `scripts/kraken_day_capture.py`
2. **Caches** trades in `backtest/data/SYMBOL/YYYY-MM-DD.jsonl.gz`
3. **Invokes** the C++ engine with `KrakenFileReplayAdapter`
4. **Receives** per-trade callbacks from the strategy
5. **Generates** JSON reports with P&L, trades, and metrics

### C++ Adapter

The `KrakenFileReplayAdapter` class (in `include/adapters/KrakenFileReplayAdapter.hpp`):

- Reads compressed JSONL.GZ files
- Parses Kraken trade JSON
- Maps Kraken fields → generic `TradePrint` events:
  - `side: "buy"/"sell"` → `TradeSide` enum
  - `ordertype: "market"/"limit"` → `OrderType` enum
  - `misc: "m"` → `TradeLiquidity::Maker`
- Registers instruments in `InstrumentRegistry`
- Emits events to subscribed strategies

## Features

### Data Management

- ✅ Automatic download from Kraken API
- ✅ Gzip compression for storage efficiency
- ✅ Metadata index (`backtest/data/.index.json`) tracking downloaded dates
- ✅ Smart caching (skip re-download unless `--force`)

### Orchestration

- ✅ Parallel day downloads (future enhancement)
- ✅ Flexible date ranges (last N days, specific start/end)
- ✅ Multiple symbol support
- ✅ Strategy configuration (JSON-based)

### Reporting

- ✅ Per-day P&L and trade statistics
- ✅ Multi-day summary (total P&L, drawdown, trade count)
- ✅ JSON output for programmatic analysis
- ✅ Timestamped reports for version control

## Future Enhancements

- [ ] Integration with C++ engine (currently placeholder)
- [ ] Real-time progress reporting during backtests
- [ ] Multi-symbol concurrent backtesting
- [ ] Risk metrics (Sharpe ratio, Calmar ratio, etc.)
- [ ] Visualization support (HTML reports, charts)
- [ ] Strategy parameter optimization (grid search, Bayesian)
- [ ] Support for other brokers (Binance, Polygon, CME)
