#pragma once

#include "engine/EventBus.hpp"
#include "engine/MarketDataTypes.hpp"
#include <unordered_map>
#include <chrono>
#include <thread>
#include <atomic>

namespace eng {

/**
 * ChartAggregator
 * 
 * Subscribes to TradePrint events and coalesces them into OHLCV candles
 * at configurable time intervals. Emits ChartCandle events to the EventBus
 * for visualization purposes.
 * 
 * Raw trade data flows through to strategies for accuracy.
 * Aggregated candles flow to the frontend for charting.
 * 
 * Future brokers can emit Candle events directly if they provide OHLC data.
 */
class ChartAggregator {
public:
    /**
     * Create aggregator with interval in milliseconds.
     * @param bus Reference to the EventBus for publishing candles
     * @param interval_ms Aggregation interval (default 1000ms = 1 second)
     */
    explicit ChartAggregator(EventBus& bus, int interval_ms = 1000)
        : bus_(bus), interval_ms_(interval_ms), running_(false) {}

    ~ChartAggregator() {
        stop();
    }

    /**
     * Start aggregating. Begins collecting trades and emitting candles.
     */
    void start() {
        if (running_) return;
        running_ = true;

        // Subscribe to TradePrint events on the bus
        bus_.subscribe("TradePrint", [this](const Event& ev) {
            try {
                auto tp = std::any_cast<TradePrint>(ev.data);
                on_trade(tp);
            } catch (const std::exception& e) {
                // Ignore type errors
            }
        });
    }

    /**
     * Stop aggregating and emit any pending candle.
     */
    void stop() {
        if (!running_) return;
        running_ = false;
        emit_pending_candle();
    }

private:
    struct CandleBuffer {
        double open{0.0};
        double high{0.0};
        double low{0.0};
        double close{0.0};
        double volume{0.0};
        TimePoint open_time{};
        bool has_data{false};
    };

    EventBus& bus_;
    int interval_ms_;
    std::atomic<bool> running_;

    // Current candle buffer per symbol
    std::unordered_map<std::string, CandleBuffer> current_candles_;
    
    // Track the current bucket time per symbol
    std::unordered_map<std::string, long> current_buckets_;

    /**
     * Snap a TimePoint to the nearest interval boundary.
     */
    long get_bucket_key(const TimePoint& tp) {
        auto ms_since_epoch = std::chrono::duration_cast<std::chrono::milliseconds>(
            tp.time_since_epoch()).count();
        return (ms_since_epoch / interval_ms_) * interval_ms_;
    }

    /**
     * Convert bucket key back to TimePoint.
     */
    TimePoint bucket_key_to_timepoint(long bucket_ms) {
        return TimePoint(std::chrono::milliseconds(bucket_ms));
    }

    /**
     * Emit the current candle for a symbol if it has data.
     */
    void emit_candle_for_symbol(const std::string& symbol) {
        auto it = current_candles_.find(symbol);
        if (it != current_candles_.end() && it->second.has_data) {
            CandleBuffer& buf = it->second;
            Candle candle{
                .symbol = symbol,
                .open_time = buf.open_time,
                .open = buf.open,
                .high = buf.high,
                .low = buf.low,
                .close = buf.close,
                .volume = buf.volume
            };

            Event ev{"ChartCandle", candle};
            bus_.publish(ev);
        }
    }

    /**
     * Emit any pending candle on shutdown.
     */
    void emit_pending_candle() {
        for (auto& [symbol, _] : current_candles_) {
            emit_candle_for_symbol(symbol);
        }
    }

    /**
     * Called when a TradePrint event arrives.
     * Checks if the trade belongs to a new time bucket.
     * If so, emits the previous candle and starts a new one.
     */
    void on_trade(const TradePrint& tp) {
        long bucket_key = get_bucket_key(tp.ts);
        
        auto bucket_it = current_buckets_.find(tp.symbol);
        long current_bucket = (bucket_it != current_buckets_.end()) ? bucket_it->second : -1;
        
        // If this trade is in a different bucket, emit the previous candle
        if (current_bucket != -1 && bucket_key != current_bucket) {
            emit_candle_for_symbol(tp.symbol);
            current_candles_[tp.symbol].has_data = false;
            current_candles_[tp.symbol].volume = 0.0;
        }
        
        // Update the current bucket for this symbol
        current_buckets_[tp.symbol] = bucket_key;
        
        // Update or initialize the current candle buffer
        auto& buf = current_candles_[tp.symbol];
        
        if (!buf.has_data) {
            // First trade in this bucket
            buf.open = tp.price;
            buf.high = tp.price;
            buf.low = tp.price;
            buf.close = tp.price;
            buf.volume = tp.qty;
            buf.open_time = bucket_key_to_timepoint(bucket_key);
            buf.has_data = true;
        } else {
            // Update OHLCV
            buf.high = std::max(buf.high, tp.price);
            buf.low = std::min(buf.low, tp.price);
            buf.close = tp.price;
            buf.volume += tp.qty;
        }
    }
};

}  // namespace eng
