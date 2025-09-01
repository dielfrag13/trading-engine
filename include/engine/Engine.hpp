#pragma once

#include "EventBus.hpp"
#include "IStrategy.hpp"
#include "IBroker.hpp"

#include <memory>

class Engine {
public:
    Engine();

    void set_strategy(std::unique_ptr<IStrategy> strat);
    void set_broker(std::unique_ptr<IBroker> brkr);

    // Start the engine; returns when shutting down
    void run();

private:
    EventBus bus_;
    std::unique_ptr<IStrategy> strategy_;
    std::unique_ptr<IBroker>   broker_;
};