#pragma once
#include "engine/IStrategy.hpp"
#include <deque>
#include <string>
#include <iostream>
#include <iomanip>

namespace strategy {

// Simple moving-average based strategy. Keeps a rolling window of the last N prices
// and computes the SMA. If price > SMA + threshold => Buy. If price < SMA - threshold => Sell.
class MovingAverageStrategy : public eng::IStrategy {
public:
    MovingAverageStrategy(std::string symbol, size_t window = 5, double threshold = 0.5, double qty = 0.01)
      : symbol_(std::move(symbol)), window_(window), threshold_(threshold), qty_(qty) {}

    
    // called by engine via callback function when any ProviderTick arrives on the bus
    void on_price_tick(const eng::PriceData& pd) override {
        // symbol filtering: return if we don't care about this symbol.
        if (pd.symbol != symbol_) return;
        prices_.push_back(pd.last);
        if (prices_.size() > window_) prices_.pop_front();

        if (prices_.size() < 1) { action_ = eng::TradeAction::None; return; }

        double sum = 0.0;
        for (double v : prices_) sum += v;
        double sma = sum / static_cast<double>(prices_.size());
        last_sma_ = sma;
        last_price_ = pd.last;

        if (pd.last > sma + threshold_) action_ = eng::TradeAction::Buy;
        else if (pd.last < sma - threshold_) action_ = eng::TradeAction::Sell;
        else action_ = eng::TradeAction::None;

        // Print current holdings and SMA info each tick for visibility
        double position = total_bought_qty_ - total_sold_qty_;
        std::cout << std::fixed << std::setprecision(2);
        std::cout << "[MovingAverage] Tick " << pd.symbol << " @ " << pd.last
                  << " SMA=" << sma << " pos=" << position
                  << " bought=" << total_bought_qty_ << " sold=" << total_sold_qty_ << "\n";
    }

    eng::TradeAction get_trade_action() override { return action_; }

    void on_order_fill(const eng::Order& order) override {
        // Update bought/sold totals on fill and reset the action
        if (order.side == eng::Order::Side::Buy) {
            total_bought_qty_ += order.qty;
        } else {
            total_sold_qty_ += order.qty;
        }
        action_ = eng::TradeAction::None;
    }

    double get_net_position() const override {
        return total_bought_qty_ - total_sold_qty_;
    }

private:
    std::string symbol_;
    size_t window_;
    double threshold_;
    double qty_;
    std::deque<double> prices_;
    double last_price_{0.0};
    double last_sma_{0.0};
    eng::TradeAction action_{eng::TradeAction::None};
    double total_bought_qty_{0.0};
    double total_sold_qty_{0.0};
};

} // namespace strategy
