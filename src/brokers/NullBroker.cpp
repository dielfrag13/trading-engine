#include "brokers/NullBroker.hpp"
#include "engine/Types.hpp"
#include <unordered_map>
#include <vector>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace broker {

NullBroker::NullBroker(double initial_balance)
    : balance_(initial_balance) {}

NullBroker::~NullBroker() = default;

void NullBroker::place_order(const eng::Order& order) {
    // default place_order will behave like a market order for now
    place_market_order(order);
}

double NullBroker::place_market_order(const eng::Order& order) {
    std::lock_guard<std::mutex> lk(mutex_);
    auto pd = get_current_price(order.symbol);
    double fill_price = pd.last;
    double filled = 0.0;

    if (order.side == eng::Order::Side::Buy) {
        // Buy logic: unchanged - add to position and deduct from balance
        double value = fill_price * order.qty;
        balance_ -= value;
        positions_[order.symbol] += order.qty;
        filled = order.qty;
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(2);
        ss << "NullBroker: Bought " << order.qty << " of " << order.symbol
           << " @ " << fill_price << " -> balance=" << balance_;
        std::cout << ss.str() << '\n';
    } else {
        // Sell logic: sell entire position at market price
        double position = positions_[order.symbol];
        if (position <= 0.0) {
            std::cout << "NullBroker: No position to sell for " << order.symbol << "\n";
            return 0.0;
        }
        double value = fill_price * position;
        balance_ += value;
        positions_[order.symbol] = 0.0;
        filled = position;
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(2);
        ss << "NullBroker: Sold " << position << " of " << order.symbol
           << " @ " << fill_price << " -> balance=" << balance_;
        std::cout << ss.str() << '\n';
    }

    return filled;
}

double NullBroker::place_limit_order(const eng::Order& order, double limit_price) {
    std::lock_guard<std::mutex> lk(mutex_);
    double market = limit_price;
    bool execute = false;
    if (order.side == eng::Order::Side::Buy) {
        // buy limit: execute if market price <= limit_price
        execute = market <= limit_price;
    } else {
        // sell limit: execute if market price >= limit_price
        execute = market >= limit_price;
    }
    double filled = 0.0;

    if (execute) {
        if (order.side == eng::Order::Side::Buy) {
            // Buy logic: unchanged - add to position and deduct from balance
            double value = market * order.qty;
            balance_ -= value;
            positions_[order.symbol] += order.qty;
            filled = order.qty;
            std::ostringstream ss;
            ss << std::fixed << std::setprecision(2);
            ss << "NullBroker: Limit executed for " << order.symbol << " @ " << market
               << " (limit=" << limit_price << ") -> balance=" << balance_;
            std::cout << ss.str() << '\n';
        } else {
            // Sell logic: sell entire position at limit price
            double position = positions_[order.symbol];
            if (position <= 0.0) {
                std::cout << "NullBroker: No position to sell for " << order.symbol << "\n";
                return 0.0;
            }
            double value = market * position;
            balance_ += value;
            positions_[order.symbol] = 0.0;
            filled = position;
            std::ostringstream ss;
            ss << std::fixed << std::setprecision(2);
            ss << "NullBroker: Limit executed for " << order.symbol << " @ " << market
               << " (limit=" << limit_price << "), sold " << position
               << " -> balance=" << balance_;
            std::cout << ss.str() << '\n';
        }
    } else {
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(2);
        ss << "NullBroker: Limit order for " << order.symbol << " @ " << limit_price
           << " not executed (market=" << market << ")";
        std::cout << ss.str() << '\n';
    }

    return filled;
}

double NullBroker::get_balance() {
    std::lock_guard<std::mutex> lk(mutex_);
    return balance_;
}

eng::PriceData NullBroker::get_current_price(const std::string& symbol) {
    // Simple deterministic price model for testing; could be extended to random or fed prices
    eng::PriceData pd;
    pd.symbol = symbol;
    pd.last = 100.0; // fixed price for now
    return pd;
}


// Open design question -- do we need a broker to subscribe to ticks?
// Or will the strategy plugins handle that? Currently, I don't see a reason
// to have brokers manage tick subscriptions.
/*
void NullBroker::subscribe_to_ticks(const std::string& symbol,
                                    std::function<void(const eng::PriceData&)> cb) {
    // For the null broker we don't produce live ticks; acknowledge subscription
    std::cout << "NullBroker: subscription registered for " << symbol << '\n';
    (void)cb;
}
//*/


} // namespace broker
