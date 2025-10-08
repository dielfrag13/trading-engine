#include "engine/Engine.hpp"
#include "strategies/NullStrategy.hpp"
#include "brokers/NullBroker.hpp"
#include "adapters/BrokerMarketData.hpp"
#include "engine/ProviderMarketData.hpp"
#include <memory>
#include <vector>
// When you implement concrete plugins, you'll include their factory headers.

int main() {

    // 1. set up a broker to facilitate orders   
    auto broker = std::make_unique<broker::NullBroker>();

    // 2. Set up one or more market-data adapters (per broker)
    auto feed1 = std::make_unique<adapter::BrokerMarketData>(*broker);

    // 3. provider (aggregator) that attaches feeds
    auto provider = std::make_unique<eng::ProviderMarketData>();
    provider->attach(std::move(feed1));
    // provider->attach(std::move(feed2));

    // 4. set strategies
    auto strat  = std::make_unique<strategy::NullStrategy>("BTCUSD", /*threshold*/ 100.0, /*qty*/ 0.01);

    // 5. engine: wire it all together
    eng::Engine engine;
    engine.set_broker(std::move(broker));
    engine.set_market_data(std::move(provider));
    engine.set_strategy(std::move(strat));
    engine.run();


    return 0;
}

