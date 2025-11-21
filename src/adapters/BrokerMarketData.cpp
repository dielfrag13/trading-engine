#include "adapters/BrokerMarketData.hpp"
#include "engine/Types.hpp"  // for PriceData (your existing type)
#include <iostream>
#include <random>
#include <cmath>


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

// Emit ticks for `seconds` seconds on a background thread.
// Prices start at 600.00 and change by a random decimal in [-1.0, +2.0]
// each second, rounded to the nearest cent.
void BrokerMarketData::start(int seconds = 30) {
    std::cout << "[BrokerMarketData] starting demo thread (" << seconds << "s)\n";
    if (running_.exchange(true)) return;

    th_ = std::thread([this, seconds] {
        using namespace std::chrono_literals;
        // RNG for per-tick delta
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> dist(-1.0, 2.0);

        double px = 600.00; // starting price
        auto start_tp = std::chrono::steady_clock::now();

        while (running_.load()) {
            if (std::chrono::steady_clock::now() - start_tp > std::chrono::seconds(seconds)) break;

            std::vector<std::string> syms;
            std::function<void(const eng::Tick&)> cb;
            {
                std::lock_guard<std::mutex> lk(m_);
                syms = tick_syms_;
                cb   = on_tick_;
            }

            if (cb && !syms.empty()) {
                // compute new price (random delta in [-1,2], round to cents)
                double delta = dist(gen);
                double new_px = std::round((px + delta) * 100.0) / 100.0;
                px = new_px;

                auto now_tp = std::chrono::system_clock::now();
                for (const auto& s : syms) {
                    eng::Tick t{ s, px, now_tp };
                    std::cout << "[BrokerMarketData thread] emitting tick " << s << " @ " << px << '\n';
                    cb(t);
                }
            }

            std::this_thread::sleep_for(1s);
        }

        running_.store(false);
    });
}

} // namespace adapter