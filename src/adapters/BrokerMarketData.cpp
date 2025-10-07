#include "adapters/BrokerMarketData.hpp"
#include "engine/Types.hpp"  // for PriceData (your existing type)
#include <chrono>

namespace adapter {
void BrokerMarketData::subscribe_ticks(const std::vector<std::string>& symbols,
                                       std::function<void(const eng::Tick&)> on_tick) {
    for (const auto& s : symbols) {
        broker_.subscribe_to_ticks(s, [on_tick](const eng::PriceData& pd){
            eng::Tick t{pd.symbol, pd.last, std::chrono::system_clock::now()};
            on_tick(t);
        });
    }
}

}