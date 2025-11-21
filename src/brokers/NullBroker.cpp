#include "brokers/NullBroker.hpp"
#include "engine/Types.hpp"
#include <unordered_map>
#include <vector>
#include <chrono>

namespace broker {

NullBroker::NullBroker(double initial_balance)
    : balance_(initial_balance) {}

NullBroker::~NullBroker() = default;

void NullBroker::place_order(const eng::Order& order) {
    // default place_order will behave like a market order for now
    place_market_order(order);
}

void NullBroker::place_market_order(const eng::Order& order) {
    std::lock_guard<std::mutex> lk(mutex_);
    // simple price model: query current price
    auto pd = get_current_price(order.symbol);
    double fill_price = pd.last;
    double value = fill_price * order.qty;
    if (order.side == eng::Order::Side::Buy) {
        balance_ -= value;
        std::cout << "NullBroker: Bought " << order.qty << " of " << order.symbol
                  << " @ " << fill_price << " -> balance=" << balance_ << '\n';
    } else {
        balance_ += value;
        std::cout << "NullBroker: Sold " << order.qty << " of " << order.symbol
                  << " @ " << fill_price << " -> balance=" << balance_ << '\n';
    }
}

void NullBroker::place_limit_order(const eng::Order& order, double limit_price) {
    std::lock_guard<std::mutex> lk(mutex_);
    auto pd = get_current_price(order.symbol);
    double market = pd.last;
    bool execute = false;
    if (order.side == eng::Order::Side::Buy) {
        // buy limit: execute if market price <= limit_price
        execute = market <= limit_price;
    } else {
        // sell limit: execute if market price >= limit_price
        execute = market >= limit_price;
    }

    if (execute) {
        double value = market * order.qty;
        if (order.side == eng::Order::Side::Buy) {
            balance_ -= value;
        } else {
            balance_ += value;
        }
        std::cout << "NullBroker: Limit executed for " << order.symbol << " @ " << market
                  << " (limit=" << limit_price << ") -> balance=" << balance_ << '\n';
    } else {
        std::cout << "NullBroker: Limit order for " << order.symbol << " @ " << limit_price
                  << " not executed (market=" << market << ")\n";
    }
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
