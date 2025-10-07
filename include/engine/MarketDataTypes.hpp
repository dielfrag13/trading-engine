#pragma once
#include <string>
#include <chrono>

namespace eng {

using TimePoint = std::chrono::time_point<std::chrono::system_clock>;

struct Tick {
    std::string symbol;
    double last{0.0};
    TimePoint ts{};
};

struct Quote {
    std::string symbol;
    double bid{0.0};
    double ask{0.0};
    TimePoint ts{};
};

struct TradePrint {
    std::string symbol;
    double price{0.0};
    double qty{0.0};
    TimePoint ts{};
};

struct Candle {
    std::string symbol;
    TimePoint   open_time{};
    double o{0.0}, h{0.0}, l{0.0}, c{0.0};
    double v{0.0};
};

}