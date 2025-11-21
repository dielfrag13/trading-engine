#include "engine/Engine.hpp"
#include "strategies/MovingAverage.hpp"
#include "brokers/NullBroker.hpp"
#include "adapters/BrokerMarketData.hpp"
#include "engine/ProviderMarketData.hpp"
#include <memory>
#include <vector>
// When you implement concrete plugins, you'll include their factory headers.

int main() {


    #ifdef ENG_DEBUG
        std::cout << "debug is on! let's go\n";
    #endif

    // 1. set up an exchange broker to facilitate orders
    // The NullBroker is a dummy broker that will just do what you tell it.
    auto broker = std::make_unique<broker::NullBroker>();

    // 2. Set up one or more market-data adapters (per broker)
    // These will provide market pricing data into the system on a tick-by-tick basis.
    // Currently, BrokerMarketData just emits dummy ticks for demo purposes.
    auto feed1 = std::make_unique<adapter::BrokerMarketData>(*broker);

    // 3. provider (aggregator) that attaches feeds
    auto provider = std::make_unique<eng::ProviderMarketData>();
    // Attach the feed before starting it so subscriptions are in place.
    provider->attach(std::move(feed1));

    // Print full tick info when ticks arrive
    // this is a dummy printing callback that happens to subscribe to the same messages. 
    provider->subscribe_ticks({ "BTCUSD" }, [](const eng::Tick& t){
        auto tp = std::chrono::system_clock::to_time_t(t.ts);
        std::cout << "Tick: " << t.symbol << " @ " << t.last << " time=" << std::ctime(&tp);
    });

    // start the feed (defaults to 30 seconds)
    provider->start_all(30);

    // note: ProviderMarketData::attach moved the unique_ptr into the provider, which
    // will start the feed internally when engine runs or we could add an explicit start()
    // For now, the concrete adapter was attached; if you want explicit start control,
    // call start on the underlying feed after exposing it.
    // For this demo we'll rely on Engine wiring which calls run() and keeps process alive.
    
    // 4. set strategies
    // Moving-average strategy: 5-sample SMA, threshold 1.0, qty 0.01
    auto strat  = std::make_unique<strategy::MovingAverageStrategy>("BTCUSD", 5, 1.0, 0.01);

    // 5. engine: wire it all together
    eng::Engine engine;
    engine.set_broker(std::move(broker));
    engine.set_market_data(std::move(provider));
    engine.set_strategy(std::move(strat));
    engine.run();


    return 0;
}

