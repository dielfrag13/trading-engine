#pragma once
#include "engine/Types.hpp"
#include <string>
#include <functional>

class IBroker {
public:
    virtual void place_order(const Order&) = 0;
    virtual double get_balance() = 0;
    virtual PriceData get_current_price(const std::string& symbol) = 0;
    virtual void subscribe_to_ticks(const std::string& symbol,
                                    std::function<void(const PriceData&)> cb) = 0;

    virtual ~IBroker() = default;
};
