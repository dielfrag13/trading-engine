#pragma once
#include "engine/IStrategy.hpp"
#include <optional>

class NullStrategy : public IStrategy {
public:
    explicit NullStrategy(std::string symbol, double threshold, double qty)
      : symbol_(std::move(symbol)), threshold_(threshold), qty_(qty) {}

    void on_price_tick(const PriceData& pd) override {
        last_price_ = pd.last;
        // Simple logic: if price < threshold => Buy; if > 2*threshold => Sell; else None
        if (pd.symbol == symbol_) {
            if (pd.last < threshold_) action_ = TradeAction::Buy;
            else if (pd.last > 2.0 * threshold_) action_ = TradeAction::Sell;
            else action_ = TradeAction::None;
        }
    }

    TradeAction get_trade_action() override { return action_; }

    void on_order_fill(const Order& /*order*/) override {
        // For demo: reset action on fill
        action_ = TradeAction::None;
    }

private:
    std::string  symbol_;
    double       threshold_{0.0};
    double       qty_{0.0};
    double       last_price_{0.0};
    TradeAction  action_{TradeAction::None};
};