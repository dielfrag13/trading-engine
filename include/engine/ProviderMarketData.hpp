// include/adapters/ProviderMarketData.hpp
#pragma once
#include "engine/IMarketData.hpp"
#include <functional>
#include <unordered_map>
#include <memory>

/*

the provider listens to the other event brokers via the EvnetBus, merges and selects data, and
republishes "canonical" market data events for strategies to use. 

[Broker A] ----\
                 \
[Broker B] -----> ProviderMarketData ---> EventBus ---> Strategy plugins
                 /
[Broker C] ----/

The provider can subscribe to child feeds and re-publishes normalized data to the engine EventBus.
It would do tasks like, say, taking "BTCUSD" from Kraken and outputting BTC (or whatever agreed upon token we're using).
*/

// include/adapters/ProviderMarketData.hpp
namespace eng {

class ProviderMarketData {
public:
void attach(std::unique_ptr<eng::IMarketData> feed) {     // add a broker feed
    feeds_.push_back(std::move(feed));
}


void subscribe_ticks(const std::vector<std::string>& syms,
                       std::function<void(const eng::Tick&)> on_tick) {
    for (auto& f : feeds_) {
      f->subscribe_ticks(syms, on_tick); // same callback works for all feeds
    }

}
private:
  std::vector<std::unique_ptr<eng::IMarketData>> feeds_;
  // symbol map, best-bid/ask chooser, failover policy, etc.
};
} // namespace eng 

