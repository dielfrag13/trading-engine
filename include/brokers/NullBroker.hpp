#pragma once
#include "engine/IBroker.hpp"
#include <functional>
#include <iostream>

class NullBroker : public IBroker {
public:
    void place_order(const Order& order) override {
        std::cout << "[NullBroker] place_order: " << order.symbol
                  << " qty=" << order.qty
                  << " side=" << (order.side == Order::Side::Buy ? "BUY" : "SELL")
                  << std::endl;
        // No-op fill simulation
    }

    double get_balance() override { return 1'000'000.0; }

    PriceData get_current_price(const std::string& symbol) override {
        return PriceData{symbol, 100.0};
    }

    void subscribe_to_ticks(const std::string& symbol,
                            std::function<void(const PriceData&)> cb) override {
        // For demo, just immediately invoke one tick
        cb(PriceData{symbol, 90.0});  // triggers a BUY given threshold=100
    }
};