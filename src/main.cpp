#include "engine/Engine.hpp"
#include "strategies/NullStrategy.hpp"
#include "brokers/NullBroker.hpp"
#include <memory>
// When you implement concrete plugins, you'll include their factory headers.

int main() {
    auto strat  = std::make_unique<NullStrategy>("BTCUSD", /*threshold*/ 100.0, /*qty*/ 0.01);
    auto broker = std::make_unique<NullBroker>();

    Engine engine;
    engine.set_strategy(std::move(strat));
    engine.set_broker(std::move(broker));
    engine.run();

    return 0;
}

