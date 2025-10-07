#pragma once
#include "engine/IBroker.hpp"
#include <functional>
#include <iostream>

namespace broker {

class NullBroker : public eng::IBroker {
public:
    void place_order(const eng::Order& order) override {
        std::cout << "[NullBroker] place_order: " << order.symbol
                  << " qty=" << order.qty
                  << " side=" << (order.side == eng::Order::Side::Buy ? "BUY" : "SELL")
                  << std::endl;
        // No-op fill simulation
    }

    double get_balance() override { return 1'000'000.0; }

    eng::PriceData get_current_price(const std::string& symbol) override {
        return eng::PriceData{symbol, 100.0};
    }

    void subscribe_to_ticks(const std::string& symbol,
                            std::function<void(const eng::PriceData&)> cb) override {
        // For demo, just immediately invoke one tick
        cb(eng::PriceData{symbol, 90.0});  // triggers a BUY given threshold=100
    }
};

}