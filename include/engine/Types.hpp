// types used throughout the project

#pragma once
#include <string>
#include <any>
#include <chrono>

namespace eng {

using TimePoint = std::chrono::time_point<std::chrono::system_clock>;

// used by 
struct PriceData {
    std::string symbol;
    double      last{0.0};
};

enum class TradeAction {
    None,
    Buy,
    Sell
};

enum class OrderStatus {
    NEW,
    WORKING,
    PARTIALLY_FILLED,
    FILLED,
    CANCELED,
    REJECTED
};

// Convert OrderStatus to string for logging/serialization
inline const char* order_status_to_string(OrderStatus status) {
    switch (status) {
        case OrderStatus::NEW: return "NEW";
        case OrderStatus::WORKING: return "WORKING";
        case OrderStatus::PARTIALLY_FILLED: return "PARTIALLY_FILLED";
        case OrderStatus::FILLED: return "FILLED";
        case OrderStatus::CANCELED: return "CANCELED";
        case OrderStatus::REJECTED: return "REJECTED";
    }
    return "UNKNOWN";
}

struct Order {
    uint64_t    id{0};                          // Unique order ID (set by broker)
    std::string symbol;
    double      qty{0.0};                       // Original requested quantity
    double      filled_qty{0.0};                // Cumulative filled quantity
    double      fill_price{0.0};                // Average fill price (updated on each fill)
    enum class Side { Buy, Sell } side{Side::Buy};
    OrderStatus status{OrderStatus::NEW};       // Current order status
    std::string rejection_reason{};             // Populated if REJECTED
    TimePoint   timestamp{};                    // Order creation timestamp (event time, not wall-clock)
};


} // namespace eng
