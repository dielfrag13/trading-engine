#pragma once

#include "EventBus.hpp"
#include "IStrategy.hpp"
#include "IBroker.hpp"
#include "IMarketData.hpp"
#include "ProviderMarketData.hpp"

#include <memory>
#include <thread>
#include <atomic>


namespace eng {

class Engine {
public:
    Engine();

    void set_strategy(std::unique_ptr<IStrategy> strat);
    void set_broker(std::unique_ptr<IBroker> brkr);
    void set_market_data(std::unique_ptr<ProviderMarketData> md);

    // Get a reference to the EventBus for external subscribers (e.g., FrontendBridge)
    EventBus& get_bus() { return bus_; }

    // Start the engine; returns when shutting down
    void run();

    // Request shutdown - safe to call from signal handlers
    void request_shutdown() { shutdown_requested_ = true; }
    
    // Check if shutdown was requested
    bool is_shutdown_requested() const { return shutdown_requested_; }

private:
    eng::EventBus bus_;
    std::unique_ptr<IStrategy> strategy_;
    std::unique_ptr<IBroker>   broker_;
    std::unique_ptr<ProviderMarketData> market_data_;
    std::atomic<bool> shutdown_requested_{false};

};

}