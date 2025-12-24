#pragma once
#include "engine/MarketDataTypes.hpp"
#include <functional>
#include <string>
#include <vector>
#include <memory>

/*
The interface that adapters -- the classes that ingest data sources like ticks -- inherit
*/

namespace eng {

// Forward declaration
class InstrumentRegistry;

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

    // New single-symbol overloads (for backtest adapters)
    virtual void subscribe_ticks(
        const std::string& symbol,
        std::function<void(const Tick&)> callback) {
        // Default: call vector-based version for compatibility
        subscribe_ticks(std::vector<std::string>{symbol}, callback);
    }

    virtual void subscribe_quotes(
        const std::string& symbol,
        std::function<void(const Quote&)> callback) {
        // Default: call vector-based version for compatibility
        subscribe_quotes(std::vector<std::string>{symbol}, callback);
    }

    virtual void subscribe_trades(
        const std::string& symbol,
        std::function<void(const TradePrint&)> callback) {
        // Default: call vector-based version for compatibility
        subscribe_trades(std::vector<std::string>{symbol}, callback);
    }

    // Optional lifecycle control for live adapters. Default no-op so existing
    // implementations do not need to change immediately.
    virtual void start() { }
    virtual void start(int /*seconds*/) { start(); }  // For compatibility
    virtual void stop() { }

    // Instrument registry access (for backtest adapters that manage instruments)
    virtual std::shared_ptr<InstrumentRegistry> get_registry() const {
        return nullptr;  // Default: not available
    }

    // Historical/backfill (e.g., for warm-up / indicators / backtest)
    
    virtual std::vector<Candle> get_hist_candles(
        const std::string& symbol,
        const std::string& interval,   // "1m","5m","1h","1d", etc.
        int limit) = 0;                 // last N bars

    // Backtest-friendly candle query by time range
    virtual std::vector<Candle> get_candles(
        const std::string& /*symbol*/,
        TimePoint /*since*/,
        int /*count*/ = -1) const {
        return {};  // Default: not available
    }
    
};

}