#include "adapters/BrokerMarketData.hpp"
#include "adapters/KrakenFileReplayAdapter.hpp"
#include "brokers/NullBroker.hpp"
#include "engine/Engine.hpp"
#include "engine/InstrumentRegistry.hpp"
#include "engine/ProviderMarketData.hpp"
#include "engine/CandlePersister.hpp"
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
  // Usage: trading_engine --data-file <path> [--symbol <symbol>]
  std::string data_file;
  std::string symbol = "BTCUSD";

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--data-file" && i + 1 < argc) {
      data_file = argv[++i];
    } else if (arg == "--symbol" && i + 1 < argc) {
      symbol = argv[++i];
    }
  }

  if (data_file.empty()) {
    std::cerr << "[Main] ERROR: --data-file is required\n";
    std::cerr << "Usage: " << argv[0] << " --data-file <path> [--symbol <symbol>]\n";
    return 1;
  }

  // Create the engine first so we can pass its bus to the broker
  auto engine = std::make_unique<eng::Engine>();
  g_engine = engine.get();  // Store pointer for signal handler

  // 1. set up an exchange broker to facilitate orders
  auto broker = std::make_unique<broker::NullBroker>(engine->get_bus());

  // 2. Set up market-data adapter with recorded trade data
  auto registry = std::make_shared<eng::InstrumentRegistry>();
  
  auto kraken_adapter = std::make_unique<adapter::KrakenFileReplayAdapter>(registry);
  kraken_adapter->start();
  auto kraken_adapter_ptr = kraken_adapter.get();  // Keep raw pointer before moving
  
  std::cout << "[Main] Using data file: " << data_file << "\n";

  // 3. provider (aggregator) that attaches feeds
  auto provider = std::make_unique<eng::ProviderMarketData>();
  provider->attach(std::move(kraken_adapter));

  // Subscribe to trades and publish to event bus
  // This connects the adapter to ChartAggregator and Strategy
  eng::EventBus& bus = engine->get_bus();
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

  // 4. set strategies
  // Moving-average strategy: 5-sample SMA, threshold 1.0, qty 0.01
  auto strat =
      std::make_unique<strategy::MovingAverageStrategy>(symbol, 5, 1.0, 0.01);

  // 5. Create the frontend bridge for WebSocket and RPC queries
  // Handles QueryCandles, QueryOrders, etc. via WebSocket on port 8080
  auto bridge = std::make_unique<server::FrontendBridge>(engine->get_bus(), *broker, 8080);
  bridge->start();

  // 5b. Create the candle persister for real-time write path
  // Subscribes to TradePrint events, buckets into 1s candles, writes to database
  // TODO: Make component selection configurable via runtime configuration
  auto persister = std::make_unique<eng::CandlePersister>(
      engine->get_bus(), 
      bridge->get_candle_store(),  // Share the same CandleStore instance
      1000  // 1 second resolution
  );
  persister->start();

  // Set up signal handlers for clean shutdown
  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  // 6. engine: wire it all together
  engine->set_broker(std::move(broker));
  engine->set_market_data(std::move(provider));
  engine->set_strategy(std::move(strat));

  // Spawn replay thread to run while engine is executing
  std::cout << "[Main] Starting replay...\n";
  auto engine_ptr = engine.get();
  auto adapter_ptr = kraken_adapter_ptr;
  auto persister_ptr = persister.get();
  std::thread replay_thread([engine_ptr, adapter_ptr, persister_ptr, &data_file]() {
    std::this_thread::sleep_for(std::chrono::seconds(5));  // Wait for frontend WebSocket connection
    std::cout << "[Main] Replaying trades from: " << data_file << "\n";
    size_t trades_replayed = adapter_ptr->replay(
        data_file,
        1.0,  // pace: 1.0 = real-time (not used in backtest, instant replay)
        nullptr  // on_trade callback (optional, use subscriptions instead)
    );
    std::cout << "[Main] Replayed " << trades_replayed << " trades.\n";
    
    // Flush all pending candles to database after replay completes
    // This ensures deterministic behavior: all replay data is persisted before queries begin
    std::cout << "[Main] Replay complete. Flushing all pending candles to database...\n";
    persister_ptr->flush_pending_data();
    std::cout << "[Main] All candles flushed. Engine staying open - press Ctrl+C to exit.\n";
  });
  replay_thread.detach();

  // Run the engine
  engine->run();

  // 7. Engine completed; stop components in reverse order and shut down cleanly
  std::cout << "\n[Main] Engine run complete. Stopping components...\n";
  
  // Stop candle persister to flush final pending candles
  persister->stop();
  std::cout << "[Main] Candle persister stopped.\n";
  
  // Stop WebSocket bridge
  bridge->stop();
  std::cout << "[Main] WebSocket server stopped.\n";
  
  std::cout << "[Main] Cleanup complete. Exiting.\n";
  return 0;
}
