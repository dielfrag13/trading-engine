#pragma once
#include "engine/IMarketData.hpp"
#include "engine/IBroker.hpp"
#include <chrono>
#include <atomic>
#include <mutex>
#include <thread>

/*
Each one of these sits closest to an exchange. This one is the null example, will eventually be backetester. 

ProviderMarketData's purpose is to subscribe to these so they're decoupled from which broker 
is actually providing the feed. 

*/


namespace adapter {

class BrokerMarketData : public eng::IMarketData {
public:
    explicit BrokerMarketData(eng::IBroker& broker) : broker_(broker) {}

    void stop();
    ~BrokerMarketData() override { stop(); }

    void subscribe_ticks(const std::vector<std::string>& symbols,
                         std::function<void(const eng::Tick&)> on_tick);

    void subscribe_quotes(const std::vector<std::string>&,
                          std::function<void(const eng::Quote&)>) override {}

    void subscribe_trades(const std::vector<std::string>&,
                          std::function<void(const eng::TradePrint&)>) override {}

    virtual std::vector<eng::Candle> get_hist_candles(
            const std::string& symbol,
            const std::string& interval,   // "1m","5m","1h","1d", etc.
            int limit) override {
                return std::vector<eng::Candle>{}; // return nothing vector for now
            };                 
    
    void start(int seconds);

private:
    eng::IBroker& broker_;
    std::mutex m_;
    std::vector<std::string> tick_syms_;
    std::function<void(const eng::Tick&)> on_tick_;

    std::atomic<bool> running_{false};
    std::thread th_;
};

}