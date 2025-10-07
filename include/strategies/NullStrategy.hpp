#pragma once
#include "engine/IStrategy.hpp"
#include <optional>

namespace strategy {

class NullStrategy : public eng::IStrategy {
public:
    explicit NullStrategy(std::string symbol, double threshold, double qty)
      : symbol_(std::move(symbol)), threshold_(threshold), qty_(qty) {}

    void on_price_tick(const eng::PriceData& pd) override {
        last_price_ = pd.last;
        // Simple logic: if price < threshold => Buy; if > 2*threshold => Sell; else None
        if (pd.symbol == symbol_) {
            if (pd.last < threshold_) action_ = eng::TradeAction::Buy;
            else if (pd.last > 2.0 * threshold_) action_ = eng::TradeAction::Sell;
            else action_ = eng::TradeAction::None;
        }
    }

    eng::TradeAction get_trade_action() override { return action_; }

    void on_order_fill(const eng::Order& /*order*/) override {
        // For demo: reset action on fill
        action_ = eng::TradeAction::None;
    }

private:
    std::string  symbol_;
    double       threshold_{0.0};
    double       qty_{0.0};
    double       last_price_{0.0};
    eng::TradeAction  action_{eng::TradeAction::None};
};
}