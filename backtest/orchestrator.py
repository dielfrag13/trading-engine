#!/usr/bin/env python3
"""
Backtest Orchestrator
=====================

Manages backtest execution for the trading engine:
1. Downloads Kraken trade data via kraken_day_capture.py
2. Caches data in backtest/data/SYMBOL/YYYY-MM-DD.jsonl.gz
3. Runs backtest via KrakenFileReplayAdapter
4. Generates per-day and summary reports

Usage:
    python backtest/orchestrator.py --symbol BTCUSD --days 10 --strategy MovingAverage
    python backtest/orchestrator.py --symbol BTCUSD --start 2024-01-01 --end 2024-01-31
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import subprocess
import gzip

# Add scripts/ to path for kraken_day_capture import
REPO_ROOT = Path(__file__).parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))


class BacktestOrchestrator:
    """Manages backtest data, execution, and reporting."""

    def __init__(self, repo_root: Path = REPO_ROOT):
        self.repo_root = repo_root
        self.data_dir = self.repo_root / "backtest" / "data"
        self.reports_dir = self.repo_root / "backtest" / "reports"
        self.scripts_dir = self.repo_root / "scripts"
        self.build_dir = self.repo_root / "build"
        
        # Create directories if missing
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        
        # Index file tracking downloaded dates
        self.index_file = self.data_dir / ".index.json"
        self._load_index()

    def _load_index(self) -> None:
        """Load cache index from disk."""
        if self.index_file.exists():
            with open(self.index_file) as f:
                self.index = json.load(f)
        else:
            self.index = {}

    def _save_index(self) -> None:
        """Save cache index to disk."""
        with open(self.index_file, 'w') as f:
            json.dump(self.index, f, indent=2)

    def _get_symbol_dir(self, symbol: str) -> Path:
        """Get directory for symbol's cached data."""
        return self.data_dir / symbol

    def _download_day(self, symbol: str, date: datetime, force: bool = False) -> bool:
        """
        Download one day of Kraken trades using kraken_day_capture.py.
        
        Returns:
            True if download succeeded, False otherwise.
        """
        symbol_dir = self._get_symbol_dir(symbol)
        symbol_dir.mkdir(parents=True, exist_ok=True)
        
        output_file = symbol_dir / f"{date.strftime('%Y-%m-%d')}.jsonl.gz"
        
        # Check if already cached
        if output_file.exists() and not force:
            print(f"  [cached] {symbol} {date.strftime('%Y-%m-%d')}")
            return True
        
        print(f"  [downloading] {symbol} {date.strftime('%Y-%m-%d')}")
        
        try:
            # Run kraken_day_capture.py
            capture_script = self.scripts_dir / "kraken_day_capture.py"
            if not capture_script.exists():
                print(f"    ERROR: {capture_script} not found")
                return False
            
            # Call the capture script (assumes it can be imported as module)
            # For now, we'll use subprocess to be safer
            cmd = [
                sys.executable,
                str(capture_script),
                "--symbol", symbol,
                "--date", date.strftime("%Y-%m-%d"),
                "--output", str(output_file),
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                print(f"    ERROR: {result.stderr}")
                return False
            
            # Verify file was created
            if not output_file.exists():
                print(f"    ERROR: Output file not created: {output_file}")
                return False
            
            # Verify it's valid gzip
            try:
                with gzip.open(output_file, 'rb') as f:
                    _ = f.read(100)  # Try reading first 100 bytes
            except Exception as e:
                print(f"    ERROR: Invalid gzip file: {e}")
                return False
            
            return True
        
        except subprocess.TimeoutExpired:
            print(f"    ERROR: Download timeout")
            return False
        except Exception as e:
            print(f"    ERROR: {e}")
            return False

    def download_days(
        self,
        symbol: str,
        dates: Optional[List[datetime]] = None,
        num_days: int = 1,
        force: bool = False
    ) -> Tuple[int, int]:
        """
        Download Kraken trade data for given dates.
        
        Args:
            symbol: Symbol to download (e.g., "BTCUSD")
            dates: Specific dates to download (if None, use last num_days)
            num_days: Number of recent days to download (if dates is None)
            force: Re-download even if cached
        
        Returns:
            Tuple of (success_count, fail_count)
        """
        if dates is None:
            # Download last N days
            today = datetime.now().date()
            dates = [
                datetime.combine(today - timedelta(days=i), datetime.min.time())
                for i in range(num_days - 1, -1, -1)
            ]
        
        print(f"Downloading {symbol}: {len(dates)} days")
        
        success = 0
        failed = 0
        
        for date in dates:
            if self._download_day(symbol, date, force=force):
                success += 1
            else:
                failed += 1
        
        print(f"Download complete: {success} succeeded, {failed} failed")
        
        # Update index
        if symbol not in self.index:
            self.index[symbol] = {"downloaded_dates": []}
        
        for date in dates:
            date_str = date.strftime("%Y-%m-%d")
            if date_str not in self.index[symbol]["downloaded_dates"]:
                self.index[symbol]["downloaded_dates"].append(date_str)
        
        self.index[symbol]["downloaded_dates"].sort()
        self._save_index()
        
        return success, failed

    def run_backtest(
        self,
        symbol: str,
        dates: Optional[List[datetime]] = None,
        strategy: str = "MovingAverage",
        config: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Run backtest for given dates using KrakenFileReplayAdapter.
        
        Args:
            symbol: Symbol to backtest
            dates: Dates to backtest (if None, use all cached dates)
            strategy: Strategy name (e.g., "MovingAverage")
            config: Strategy configuration dict
        
        Returns:
            List of daily results (one dict per day)
        """
        if config is None:
            config = {}
        
        # Get dates to backtest
        if dates is None:
            symbol_dir = self._get_symbol_dir(symbol)
            if not symbol_dir.exists():
                print(f"ERROR: No cached data for {symbol}")
                return []
            
            # Find all .jsonl.gz files in symbol directory
            jsonl_files = sorted(symbol_dir.glob("*.jsonl.gz"))
            if not jsonl_files:
                print(f"ERROR: No JSONL.GZ files in {symbol_dir}")
                return []
            
            dates = [
                datetime.strptime(f.stem, "%Y-%m-%d")
                for f in jsonl_files
            ]
        
        print(f"Running backtest for {symbol}: {len(dates)} days, strategy={strategy}")
        
        results = []
        
        for date in dates:
            date_str = date.strftime("%Y-%m-%d")
            data_file = self._get_symbol_dir(symbol) / f"{date_str}.jsonl.gz"
            
            if not data_file.exists():
                print(f"  [skip] {date_str} - data file not found")
                continue
            
            print(f"  [run] {date_str}")
            
            # TODO: Invoke the C++ engine with KrakenFileReplayAdapter
            # For now, we'll create a placeholder result
            daily_result = {
                "symbol": symbol,
                "date": date_str,
                "strategy": strategy,
                "data_file": str(data_file),
                "trades": [],
                "pnl": 0.0,
                "pnl_pct": 0.0,
                "max_drawdown": 0.0,
                "status": "placeholder",  # TODO: Update after real backtest
            }
            
            results.append(daily_result)
        
        return results

    def generate_report(
        self,
        symbol: str,
        results: List[Dict[str, Any]],
        output_file: Optional[Path] = None
    ) -> Path:
        """
        Generate a backtest report from daily results.
        
        Args:
            symbol: Symbol being backtested
            results: List of daily result dicts
            output_file: Output file path (auto-generated if None)
        
        Returns:
            Path to generated report
        """
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = self.reports_dir / f"{symbol}_{timestamp}.json"
        
        # Aggregate results
        total_pnl = sum(r.get("pnl", 0.0) for r in results)
        total_trades = sum(len(r.get("trades", [])) for r in results)
        max_dd = min((r.get("max_drawdown", 0.0) for r in results), default=0.0)
        
        report = {
            "symbol": symbol,
            "generated": datetime.now().isoformat(),
            "summary": {
                "num_days": len(results),
                "total_pnl": total_pnl,
                "total_trades": total_trades,
                "max_drawdown": max_dd,
                "avg_pnl_per_day": total_pnl / len(results) if results else 0.0,
            },
            "daily_results": results,
        }
        
        # Write report
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"Report generated: {output_file}")
        
        return output_file


def main():
    parser = argparse.ArgumentParser(description="Backtest Orchestrator")
    parser.add_argument("--symbol", required=True, help="Symbol to backtest (e.g., BTCUSD)")
    parser.add_argument("--days", type=int, default=1, help="Number of recent days to download")
    parser.add_argument("--start", type=str, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, help="End date (YYYY-MM-DD)")
    parser.add_argument("--strategy", default="MovingAverage", help="Strategy name")
    parser.add_argument("--force", action="store_true", help="Re-download cached data")
    parser.add_argument("--output", type=str, help="Output report file")
    
    args = parser.parse_args()
    
    orch = BacktestOrchestrator()
    
    # Determine dates
    dates = None
    if args.start and args.end:
        start = datetime.strptime(args.start, "%Y-%m-%d")
        end = datetime.strptime(args.end, "%Y-%m-%d")
        dates = []
        current = start
        while current <= end:
            dates.append(current)
            current += timedelta(days=1)
    
    # Download data
    print(f"\n=== Downloading Kraken Data ===")
    success, failed = orch.download_days(
        args.symbol,
        dates=dates,
        num_days=args.days,
        force=args.force
    )
    
    if success == 0:
        print("ERROR: No data downloaded")
        return 1
    
    # Run backtest
    print(f"\n=== Running Backtest ===")
    results = orch.run_backtest(
        args.symbol,
        dates=dates,
        strategy=args.strategy
    )
    
    if not results:
        print("ERROR: Backtest produced no results")
        return 1
    
    # Generate report
    print(f"\n=== Generating Report ===")
    output_file = Path(args.output) if args.output else None
    report_path = orch.generate_report(args.symbol, results, output_file)
    
    # Print summary
    print(f"\n=== Summary ===")
    with open(report_path) as f:
        report = json.load(f)
    
    summary = report["summary"]
    print(f"Days:              {summary['num_days']}")
    print(f"Total Trades:      {summary['total_trades']}")
    print(f"Total P&L:         ${summary['total_pnl']:.2f}")
    print(f"Avg P&L/Day:       ${summary['avg_pnl_per_day']:.2f}")
    print(f"Max Drawdown:      {summary['max_drawdown']:.2%}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
