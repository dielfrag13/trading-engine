#include "adapters/BrokerMarketData.hpp"
#include "brokers/NullBroker.hpp"
#include "engine/Engine.hpp"
#include "engine/ProviderMarketData.hpp"
#include "strategies/MovingAverage.hpp"
#include "server/FrontendBridge.hpp"
#include <memory>
#include <vector>
#include <thread>
#include <chrono>
#include <iostream>
#include <csignal>
#include <atomic>
// When you implement concrete plugins, you'll include their factory headers.

static std::atomic<bool> shutdown_requested(false);
static eng::Engine* g_engine = nullptr;

void signal_handler(int sig) {
  std::cout << "\n[Main] Shutdown signal received. Cleaning up...\n";
  shutdown_requested = true;
  if (g_engine) {
    g_engine->request_shutdown();
  }
}

int main() {

#ifdef ENG_DEBUG
  std::cout << "debug is on! let's go\n";
#endif

  // Create the engine first so we can pass its bus to the broker
  auto engine = std::make_unique<eng::Engine>();
  g_engine = engine.get();  // Store pointer for signal handler

  // 1. set up an exchange broker to facilitate orders
  // The NullBroker is a dummy broker that will just do what you tell it.
  // Pass the engine's event bus so orders can be published
  auto broker = std::make_unique<broker::NullBroker>(engine->get_bus());

  // 2. Set up one or more market-data adapters (per broker)
  // These will provide market pricing data into the system on a tick-by-tick
  // basis. Currently, BrokerMarketData just emits dummy ticks for demo
  // purposes.
  auto feed1 = std::make_unique<adapter::BrokerMarketData>(*broker);

  // 3. provider (aggregator) that attaches feeds
  auto provider = std::make_unique<eng::ProviderMarketData>();
  // Attach the feed before starting it so subscriptions are in place.
  provider->attach(std::move(feed1));

  // Print full tick info when ticks arrive
  // this is a dummy printing callback that happens to subscribe to the same
  // messages.
  provider->subscribe_ticks({"BTCUSD"}, [](const eng::Tick &t) {
    auto tp = std::chrono::system_clock::to_time_t(t.ts);
    std::cout << "Tick: " << t.symbol << " @ " << t.last
              << " time=" << std::ctime(&tp);
  });

  // start the feed (now runs 45 seconds; final 15s are inverted-bias)
  provider->start_all(45);

  // note: ProviderMarketData::attach moved the unique_ptr into the provider,
  // which will start the feed internally when engine runs or we could add an
  // explicit start() For now, the concrete adapter was attached; if you want
  // explicit start control, call start on the underlying feed after exposing
  // it. For this demo we'll rely on Engine wiring which calls run() and keeps
  // process alive.

  // 4. set strategies
  // Moving-average strategy: 5-sample SMA, threshold 1.0, qty 0.01
  auto strat =
      std::make_unique<strategy::MovingAverageStrategy>("BTCUSD", 5, 1.0, 0.01);

  // 5. Create the frontend bridge to serve ticks to the GUI
  // This subscribes to ProviderTick events and broadcasts them to connected
  // frontend clients via WebSocket on port 3000
  auto bridge = std::make_unique<server::FrontendBridge>(engine->get_bus(), 3000);
  bridge->start();

  // Set up signal handlers for clean shutdown
  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  // 6. engine: wire it all together
  engine->set_broker(std::move(broker));
  engine->set_market_data(std::move(provider));
  engine->set_strategy(std::move(strat));
  engine->run();

  // 7. Engine completed; stop the bridge and shut down cleanly
  std::cout << "\n[Main] Engine run complete. Stopping WebSocket server...\n";
  bridge->stop();
  
  std::cout << "[Main] Cleanup complete. Exiting.\n";
  return 0;
}
