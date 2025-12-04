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
                    Order o;
                    o.symbol = t.symbol;
                    o.qty = 0.01;
                    o.side = Order::Side::Buy;
                    if (broker_) {
                        // place a limit buy at the most recent price and obtain filled qty
                        double filled = broker_->place_limit_order(o, t.last);
                        std::cout << "[Engine] Placed LIMIT BUY " << o.qty << " " << o.symbol
                                  << " @ " << t.last << " (filled=" << filled << ")\n";
                        if (filled > 0.0 && strategy_) {
                            Order filled_o = o;
                            filled_o.qty = filled;
                            strategy_->on_order_fill(filled_o);
                        }
                    }
                } else if (act == TradeAction::Sell) {
                    Order o;
                    o.symbol = t.symbol;
                    o.qty = 0.01;
                    o.side = Order::Side::Sell;
                    if (broker_) {
                        // place a limit sell at the most recent price and obtain filled qty
                        double filled = broker_->place_limit_order(o, t.last);
                        std::cout << "[Engine] Placed LIMIT SELL " << o.qty << " " << o.symbol
                                  << " @ " << t.last << " (filled=" << filled << ")\n";
                        if (filled > 0.0 && strategy_) {
                            Order filled_o = o;
                            filled_o.qty = filled;
                            strategy_->on_order_fill(filled_o);
                        }
                    }
                } else {
                    std::cout << "[Engine] Strategy: No action." << std::endl;
                }
            }
        } catch (const std::bad_any_cast& e) {
            std::cerr << "[Engine] bad_any_cast when handling ProviderTick\n";
        }
    });

    std::cout << "[Engine] sleeping for like 45 seconds.\n";
    
    // Sleep with periodic checks for shutdown signal
    auto start = std::chrono::steady_clock::now();
    auto duration = std::chrono::seconds(45);
    
    while (!shutdown_requested_) {
        auto elapsed = std::chrono::steady_clock::now() - start;
        if (elapsed >= duration) {
            break;
        }
        
        // Check shutdown every 100ms
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    if (shutdown_requested_) {
        std::cout << "[Engine] Shutdown requested - stopping run early.\n";
    }
    
    std::cout << "[Engine] Run complete.\n";
}



