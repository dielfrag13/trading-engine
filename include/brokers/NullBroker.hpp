#pragma once
#include "engine/IBroker.hpp"
#include <functional>
#include <iostream>
#include <mutex>

namespace broker {

class NullBroker : public eng::IBroker {
public:
    explicit NullBroker(double initial_balance = 1'000'000.0);
    ~NullBroker() override;

    // TODO: may be able to get rid of place_order as we will always use market/limit explicitly
    void place_order(const eng::Order& order) override;
    // return filled quantity
    double place_market_order(const eng::Order& order) override;
    double place_limit_order(const eng::Order& order, double limit_price) override;

    double get_balance() override;

    eng::PriceData get_current_price(const std::string& symbol) override;

    /*
    void subscribe_to_ticks(const std::string& symbol,
                            std::function<void(const eng::PriceData&)> cb) override;
    */

private:
    double balance_;
    std::unordered_map<std::string, double> positions_;  // track qty held per symbol
    std::mutex mutex_;
};



}