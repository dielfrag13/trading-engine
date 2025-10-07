// types used throughout the project

#pragma once
#include <string>
#include <any>

namespace eng {

struct PriceData {
    std::string symbol;
    double      last{0.0};
};

enum class TradeAction {
    None,
    Buy,
    Sell
};

struct Order {
    std::string symbol;
    double      qty{0.0};
    enum class Side { Buy, Sell } side{Side::Buy};
};


} // namespace eng
