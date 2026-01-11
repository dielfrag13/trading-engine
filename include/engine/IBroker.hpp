#pragma once
#include "engine/Types.hpp"
#include <string>
#include <functional>
#include <memory>
#include <vector>
#include <unordered_map>
#include <unordered_map>

/*
the interface in which brokers -- the classes that perform orders, check account balances, etc -- inherit.
*/

namespace eng {

class EventBus;

class IBroker {
public:
    virtual void place_order(const Order&) = 0;

    // New explicit API separating market and limit orders
    // Market order: execute immediately at current market price
    // Returns the filled quantity (0.0 if nothing executed).
    virtual double place_market_order(const Order& /*order*/) {
        // default: no execution
        return 0.0;
    }

    // Limit order: specify a limit price at which to execute
    // Timestamp is the event time (data time, not wall-clock)
    // Returns the filled quantity (0.0 if not executed).
    virtual double place_limit_order(const Order& /*order*/, double /*limit_price*/, TimePoint /*event_time*/ = TimePoint()) {
        // default: not executed
        return 0.0;
    }
    virtual double get_balance() = 0;
    virtual PriceData get_current_price(const std::string& symbol) = 0;
    
    // Get all current positions (symbol -> quantity)
    // Default implementation returns empty map for brokers that don't track positions
    virtual std::unordered_map<std::string, double> get_positions() const {
        return {};
    }

    // Get all orders (including historical)
    // Default implementation returns empty vector for brokers that don't track orders
    virtual std::vector<Order> get_orders() const {
        return {};
    }
    /*
    virtual void subscribe_to_ticks(const std::string& symbol,
                                    std::function<void(const PriceData&)> cb) = 0;
    */

    virtual ~IBroker() = default;
};

} // namespace eng