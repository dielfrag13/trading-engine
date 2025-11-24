#include "adapters/BrokerMarketData.hpp"
#include "engine/Types.hpp"  // for PriceData (your existing type)
#include <iostream>
#include <random>
#include <cmath>


namespace adapter {

using TimePoint = std::chrono::time_point<std::chrono::system_clock>;

// this would normally subscribe to external broker ticks and republish data
// to its own subscribers
void BrokerMarketData::subscribe_ticks(const std::vector<std::string>& symbols,
                        std::function<void(const eng::Tick&)> on_tick) {
    std::lock_guard<std::mutex> lk(m_);
    // Merge requested symbols into the internal symbol set (avoid duplicates)
    for (const auto& s : symbols) {
        if (std::find(tick_syms_.begin(), tick_syms_.end(), s) == tick_syms_.end()) {
            tick_syms_.push_back(s);
        }
    }
    // Store the handler so multiple subscribers receive ticks
    on_tick_handlers_.push_back(std::move(on_tick));
    std::cout << "[BrokerMarketData] adapter subscribed (total handlers=" << on_tick_handlers_.size() << ")\n";
}

void BrokerMarketData::stop() {
    if (!running_.exchange(false)) return;
    if (th_.joinable()) th_.join();
}

// Emit ticks for `seconds` seconds on a background thread.
// Prices start at 600.00 and change by a random decimal in [-1.0, +2.0]
// for the initial period, then switch to an inverted distribution in the
// final 15 seconds ([-2.0, +1.0]) to bias price direction the other way.
// Each second emission is rounded to the nearest cent.
void BrokerMarketData::start(int seconds = 45) {
    std::cout << "[BrokerMarketData] starting demo thread (" << seconds << "s)\n";
    if (running_.exchange(true)) return;

    th_ = std::thread([this, seconds] {
        using namespace std::chrono_literals;
        // RNG for per-tick delta
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> forward_dist(-1.0, 2.0);
        std::uniform_real_distribution<double> inverted_dist(-2.0, 1.0);

        double px = 600.00; // starting price
        auto start_tp = std::chrono::steady_clock::now();

        while (running_.load()) {
            auto now_sc = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now_sc - start_tp).count();
            if (elapsed > seconds) break;

            std::vector<std::string> syms;
            std::vector<std::function<void(const eng::Tick&)>> handlers;
            {
                std::lock_guard<std::mutex> lk(m_);
                syms = tick_syms_;
                handlers = on_tick_handlers_;
            }

            if (!handlers.empty() && !syms.empty()) {
                // choose distribution: in the final 15 seconds use the inverted distribution
                int remaining = seconds - static_cast<int>(elapsed);
                double delta;
                if (remaining <= 15) {
                    // last 15s: invert bias to negative direction
                    delta = inverted_dist(gen);
                } else {
                    // initial period: forward biased delta
                    delta = forward_dist(gen);
                }

                // compute new price and round to cents
                double new_px = std::round((px + delta) * 100.0) / 100.0;
                px = new_px;

                auto now_tp = std::chrono::system_clock::now();

                // emit a tick for each symbol to all handlers
                for (const auto& s : syms) {
                    eng::Tick t{ s, px, now_tp };
                    std::cout << "[BrokerMarketData thread] emitting tick " << s << " @ " << px << '\n';
                    for (auto &h : handlers) {
                        if (h) h(t);
                    }
                }
            }

            std::this_thread::sleep_for(1s);
        }

        running_.store(false);
    });
}

} // namespace adapter