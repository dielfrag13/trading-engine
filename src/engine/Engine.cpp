/*
 * The core Engine class, responsible for tying together strategies, brokers, and the event bus. 
 */

#include "engine/Engine.hpp"
#include "engine/Types.hpp"
#include "engine/MarketDataTypes.hpp"
#include "engine/ProviderMarketData.hpp"
#include <iostream>
#include <memory>

using namespace eng;

Engine::Engine() = default;

void Engine::set_strategy(std::unique_ptr<IStrategy> strat) {
    strategy_ = std::move(strat);
}

void Engine::set_broker(std::unique_ptr<IBroker> brkr) {
    broker_ = std::move(brkr);
}

void Engine::set_market_data(std::unique_ptr<ProviderMarketData> md) {
    market_data_ = std::move(md);

    // Tell provider what symbols to listen for, and wire its callback to publish on the bus
    market_data_->subscribe_ticks({ "BTCUSD" }, [this](const Tick& t){
        Event ev{ "ProviderTick", t };
        bus_.publish(ev);
    });

}

void Engine::run() {

    if (!strategy_ || !broker_ || !market_data_) {
        std::cerr << "[Engine] Missing strategy, broker, or market data stream.\n";
        return;
    }

    // Demo: subscribe to a single tick and let the strategy react
    const std::string symbol = "BTCUSD";

    // Subscribe to ProviderTick events on the bus and forward to the strategy.
    bus_.subscribe("ProviderTick", [this](const Event& ev){
        try {
            auto t = std::any_cast<Tick>(ev.data);
            if (strategy_) {
                strategy_->on_price_tick({t.symbol, t.last});
                auto act = strategy_->get_trade_action();
                if (act == TradeAction::Buy) {
                    Order o{t.symbol, 0.01, Order::Side::Buy};
                    if (broker_) broker_->place_market_order(o);
                    if (strategy_) strategy_->on_order_fill(o);
                } else if (act == TradeAction::Sell) {
                    Order o{t.symbol, 0.01, Order::Side::Sell};
                    if (broker_) broker_->place_market_order(o);
                    if (strategy_) strategy_->on_order_fill(o);
                } else {
                    std::cout << "[Engine] Strategy: No action.\n";
                }
            }
        } catch (const std::bad_any_cast& e) {
            std::cerr << "[Engine] bad_any_cast when handling ProviderTick\n";
        }
    });

    std::cout << "[Engine] sleeping for like 30 seconds.\n";
    std::this_thread::sleep_for(std::chrono::seconds(30));
    std::cout << "[Engine] Run complete.\n";
}



