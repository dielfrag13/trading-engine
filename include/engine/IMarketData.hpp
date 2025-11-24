#pragma once
#include "engine/MarketDataTypes.hpp"
#include <functional>
#include <string>
#include <vector>

/*
The interface that adapters -- the classes that ingest data sources like ticks -- inherit
*/
namespace eng {
class IMarketData {
public:
    virtual ~IMarketData() = default;

    // Live streaming -- subscribe to external data sources
    // publish data to internal subscribers 
    virtual void subscribe_ticks(
        const std::vector<std::string>& symbols,
        std::function<void(const Tick&)> on_tick) = 0;

    virtual void subscribe_quotes(
        const std::vector<std::string>& symbols,
        std::function<void(const Quote&)> on_quote) = 0;

    virtual void subscribe_trades(
        const std::vector<std::string>& symbols,
        std::function<void(const TradePrint&)> on_trade) = 0;

    // Optional lifecycle control for live adapters. Default no-op so existing
    // implementations do not need to change immediately.
    virtual void start(int /*seconds*/) { }
    virtual void stop() { }

    // Historical/backfill (e.g., for warm-up / indicators / backtest)
    
    virtual std::vector<Candle> get_hist_candles(
        const std::string& symbol,
        const std::string& interval,   // "1m","5m","1h","1d", etc.
        int limit) = 0;                 // last N bars
    
};

}