#pragma once

#include "EventBus.hpp"
#include "IStrategy.hpp"
#include "IBroker.hpp"
#include "IMarketData.hpp"
#include "ProviderMarketData.hpp"

#include <memory>


namespace eng {

class Engine {
public:
    Engine();

    void set_strategy(std::unique_ptr<IStrategy> strat);
    void set_broker(std::unique_ptr<IBroker> brkr);
    void set_market_data(std::unique_ptr<ProviderMarketData> md);


    // Start the engine; returns when shutting down
    void run();

private:
    eng::EventBus bus_;
    std::unique_ptr<IStrategy> strategy_;
    std::unique_ptr<IBroker>   broker_;
    std::unique_ptr<ProviderMarketData> market_data_;

};

}