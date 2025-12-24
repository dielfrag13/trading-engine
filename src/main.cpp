#include "adapters/BrokerMarketData.hpp"
#include "adapters/KrakenFileReplayAdapter.hpp"
#include "brokers/NullBroker.hpp"
#include "engine/Engine.hpp"
#include "engine/InstrumentRegistry.hpp"
#include "engine/ProviderMarketData.hpp"
#include "engine/ChartAggregator.hpp"
#include "strategies/MovingAverage.hpp"
#include "server/FrontendBridge.hpp"
#include <memory>
#include <vector>
#include <thread>
#include <chrono>
#include <iostream>
#include <csignal>
#include <atomic>
#include <string>
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

int main(int argc, char* argv[]) {

#ifdef ENG_DEBUG
  std::cout << "debug is on! let's go\n";
#endif

  // Parse command-line arguments
  // Usage: trading_engine [--data-file <path>] [--symbol <symbol>] [--output <output-file>]
  std::string data_file;
  std::string symbol = "BTCUSD";
  std::string output_file;
  bool use_backtest = false;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--data-file" && i + 1 < argc) {
      data_file = argv[++i];
      use_backtest = true;
    } else if (arg == "--symbol" && i + 1 < argc) {
      symbol = argv[++i];
    } else if (arg == "--output" && i + 1 < argc) {
      output_file = argv[++i];
    }
  }

  // Create the engine first so we can pass its bus to the broker
  auto engine = std::make_unique<eng::Engine>();
  g_engine = engine.get();  // Store pointer for signal handler

  // 1. set up an exchange broker to facilitate orders
  // The NullBroker is a dummy broker that will just do what you tell it.
  // Pass the engine's event bus so orders can be published
  auto broker = std::make_unique<broker::NullBroker>(engine->get_bus());

  // 2. Set up one or more market-data adapters (per broker)
  // For backtest: use KrakenFileReplayAdapter with recorded trade data
  // For live: use BrokerMarketData for real-time ticks
  auto registry = std::make_shared<eng::InstrumentRegistry>();
  
  std::unique_ptr<eng::IMarketData> feed1;
  adapter::KrakenFileReplayAdapter* kraken_adapter_ptr = nullptr;

  if (use_backtest && !data_file.empty()) {
    // Backtest mode: use KrakenFileReplayAdapter
    auto kraken_adapter = std::make_unique<adapter::KrakenFileReplayAdapter>(registry);
    kraken_adapter->start();
    kraken_adapter_ptr = kraken_adapter.get();  // Keep raw pointer before moving
    feed1 = std::move(kraken_adapter);
    std::cout << "[Main] Using backtest mode with data file: " << data_file << "\n";
  } else {
    // Live mode: use BrokerMarketData for demo
    feed1 = std::make_unique<adapter::BrokerMarketData>(*broker);
    std::cout << "[Main] Using live mode (demo data)\n";
  }

  // 3. provider (aggregator) that attaches feeds
  auto provider = std::make_unique<eng::ProviderMarketData>();
  // Attach the feed before starting it so subscriptions are in place.
  provider->attach(std::move(feed1));

  // Print full tick info when ticks arrive
  // this is a dummy printing callback that happens to subscribe to the same
  // messages.
  provider->subscribe_ticks({symbol}, [symbol](const eng::Tick &t) {
    auto tp = std::chrono::system_clock::to_time_t(t.ts);
    std::cout << "Tick: " << t.symbol << " @ " << t.last
              << " time=" << std::ctime(&tp);
  });

  // For backtest, also subscribe to trades and convert them to ticks
  // This ensures the strategy receives price updates from the replay
  // We also publish TradePrint events so ChartAggregator can coalesce them
  eng::EventBus& bus = engine->get_bus();
  if (use_backtest && !data_file.empty()) {
    provider->subscribe_trades({symbol}, [symbol, &bus](const eng::TradePrint &tp) {
      // Publish TradePrint for ChartAggregator to consume
      eng::Event trade_ev{"TradePrint", tp};
      bus.publish(trade_ev);
      
      // Convert TradePrint to Tick event for the strategy
      eng::Tick tick{
          .symbol = tp.symbol,
          .last = tp.price,
          .ts = tp.ts
      };
      eng::Event ev{"ProviderTick", tick};
      bus.publish(ev);
    });
  }

  // For backtest: replay trades from file; for live: run for 45 seconds
  if (use_backtest && !data_file.empty()) {
    std::cout << "[Main] Starting backtest replay...\n";
    // In backtest mode, we'll replay after setting up the strategy
  } else {
    std::cout << "[Main] Starting live demo (45 seconds)...\n";
    provider->start_all(45);
  }

  // 4. set strategies
  // Moving-average strategy: 5-sample SMA, threshold 1.0, qty 0.01
  auto strat =
      std::make_unique<strategy::MovingAverageStrategy>(symbol, 5, 1.0, 0.01);

  // 5. Create the frontend bridge to serve ticks to the GUI
  // This subscribes to ProviderTick events and broadcasts them to connected
  // frontend clients via WebSocket on port 3000
  auto bridge = std::make_unique<server::FrontendBridge>(engine->get_bus(), 3000);
  bridge->start();

  // 5b. Create the chart aggregator to coalesce trades into candles
  // This subscribes to TradePrint events and emits ChartCandle events
  // at regular intervals (default 1 second) for visualization
  auto chart_agg = std::make_unique<eng::ChartAggregator>(engine->get_bus(), 1000);  // 1000ms = 1 second
  chart_agg->start();

  // Set up signal handlers for clean shutdown
  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  // 6. engine: wire it all together
  engine->set_broker(std::move(broker));
  engine->set_market_data(std::move(provider));
  engine->set_strategy(std::move(strat));

  if (use_backtest && !data_file.empty()) {
    // Backtest mode: spawn replay thread to run while engine is executing
    std::cout << "[Main] Starting backtest...\n";
    auto engine_ptr = engine.get();
    auto adapter_ptr = kraken_adapter_ptr;
    std::thread replay_thread([engine_ptr, adapter_ptr, &data_file]() {
      std::this_thread::sleep_for(std::chrono::seconds(5));  // Wait for frontend WebSocket connection
      std::cout << "[Main] Replaying trades from: " << data_file << "\n";
      size_t trades_replayed = adapter_ptr->replay(
          data_file,
          1.0,  // pace: 1.0 = real-time (not used in backtest, instant replay)
          nullptr  // on_trade callback (optional, use subscriptions instead)
      );
      std::cout << "[Main] Replayed " << trades_replayed << " trades.\n";
      std::cout << "[Main] Backtest replay complete. Requesting shutdown.\n";
      engine_ptr->request_shutdown();
    });
    replay_thread.detach();
  }

  // Run the engine
  engine->run();

  // 7. Engine completed; stop the bridge and shut down cleanly
  std::cout << "\n[Main] Engine run complete. Stopping WebSocket server...\n";
  bridge->stop();
  
  std::cout << "[Main] Cleanup complete. Exiting.\n";
  return 0;
}
