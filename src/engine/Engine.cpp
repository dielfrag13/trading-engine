/*
 * The core Engine class, responsible for tying together strategies, brokers, and the event bus. 
 */

#include "engine/Engine.hpp"
#include "engine/Types.hpp"
#include "engine/MarketDataTypes.hpp"
#include <iostream>

using namespace eng;

Engine::Engine() = default;

void Engine::set_strategy(std::unique_ptr<IStrategy> strat) {
    strategy_ = std::move(strat);
}

void Engine::set_broker(std::unique_ptr<IBroker> brkr) {
    broker_ = std::move(brkr);
}

void Engine::set_market_data(std::unique_ptr<IMarketData> md) {
    market_data_ = std::move(md);
}

void Engine::run() {
    // Minimal no-op run loop for now so we can compile & link.
    // Later: hook up market data subscriptions via bus_, call
    // strategy_->on_price_tick(...), place orders via broker_, etc.

    if (!strategy_ || !broker_ || !market_data_) {
        std::cerr << "[Engine] Missing strategy, broker, or market data stream.\n";
        return;
    }

    // Demo: subscribe to a single tick and let the strategy react
    const std::string symbol = "BTCUSD";
    broker_->subscribe_to_ticks(symbol, [&](const PriceData& pd){
        strategy_->on_price_tick(pd);
        auto act = strategy_->get_trade_action();
        if (act == TradeAction::Buy) {
            Order o{pd.symbol, 0.01, Order::Side::Buy};
            broker_->place_order(o);
            strategy_->on_order_fill(o);
        } else if (act == TradeAction::Sell) {
            Order o{pd.symbol, 0.01, Order::Side::Sell};
            broker_->place_order(o);
            strategy_->on_order_fill(o);
        } else {
            std::cout << "[Engine] No action.\n";
        }
    });

    std::cout << "[Engine] Run complete.\n";
}



