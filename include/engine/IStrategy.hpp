#pragma once
#include "engine/Types.hpp"

namespace eng {

class IStrategy {
public:
    virtual void on_price_tick(const PriceData&) = 0;
    virtual TradeAction get_trade_action() = 0;
    virtual void on_order_fill(const Order&) = 0;
    
    // Get current net position (total bought - total sold)
    // Used by engine to validate sell orders before submission
    // Compatible with: long/short equities, crypto, futures, options (delta-adjusted)
    virtual double get_net_position() const { return 0.0; }
    
    virtual ~IStrategy() = default;
};

}