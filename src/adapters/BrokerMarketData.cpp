#include "adapters/BrokerMarketData.hpp"
#include "engine/Types.hpp"  // for PriceData (your existing type)
#include <iostream>


namespace adapter {

using TimePoint = std::chrono::time_point<std::chrono::system_clock>;

void BrokerMarketData::subscribe_ticks(const std::vector<std::string>& symbols,
                        std::function<void(const eng::Tick&)> on_tick) {
    std::lock_guard<std::mutex> lk(m_);
    tick_syms_ = symbols;
    on_tick_   = std::move(on_tick);
    std::cout << "[BrokerMarketData] adapter subscribed\n";
}

void BrokerMarketData::stop() {
    if (!running_.exchange(false)) return;
    if (th_.joinable()) th_.join();
}

void BrokerMarketData::start(int seconds = 10) {
    std::cout << "[BrokerMarketData] starting demo thread\n";
    if (running_.exchange(true)) return;
        th_ = std::thread([this, seconds] {
        using namespace std::chrono_literals;
        double px = 10000.0;
        auto start = std::chrono::steady_clock::now();

        while (running_) {
            if (std::chrono::steady_clock::now() - start > std::chrono::seconds(seconds)) break;

            std::vector<std::string> syms;
            std::function<void(const eng::Tick&)> cb;
            {
                std::lock_guard<std::mutex> lk(m_);
                syms = tick_syms_;
                cb   = on_tick_;
            }

            if (cb && !syms.empty()) {
                auto now_tp = std::chrono::system_clock::now();
                for (const auto& s : syms) {
                    eng::Tick t{ s, px, now_tp };
                    std::cout << "[BrokerMarketData thread] emitting a tick\n";
                    cb(t);
                }
            }

            px += 5.0;
            std::this_thread::sleep_for(1s);
        }
        running_ = false;
    });
}

} // namespace adapter