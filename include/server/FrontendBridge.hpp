#pragma once
#include "engine/EventBus.hpp"
#include "engine/Types.hpp"
#include "engine/MarketDataTypes.hpp"
#include "engine/CandleStore.hpp"
#include "engine/IBroker.hpp"
#include <memory>
#include <functional>
#include <thread>
#include <vector>
#include <mutex>
#include <atomic>
#include <deque>
#include <set>
#include <string>
#include <chrono>
#include <nlohmann/json.hpp>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

/*
FrontendBridge:
  Subscribes to EventBus topics (ProviderTick, OrderFill, etc.) and broadcasts
  them as JSON via WebSocket to connected frontend clients.
*/

namespace server {

using json = nlohmann::json;
typedef websocketpp::server<websocketpp::config::asio> WebSocketServerType;
typedef WebSocketServerType::connection_ptr connection_ptr;

class FrontendBridge {
public:
  explicit FrontendBridge(eng::EventBus& bus, eng::IBroker& broker, int port = 3000);
  ~FrontendBridge();

  // Start listening to EventBus and broadcasting ticks
  void start();

  // Stop the bridge
  void stop();

  // Get recent ticks (thread-safe)
  std::vector<json> get_recent_ticks(size_t limit = 100) const;

  // Access to persistent candle store (shared with CandlePersister)
  std::shared_ptr<eng::CandleStore> get_candle_store() { return candle_store_; }

private:
  eng::EventBus& bus_;
  eng::IBroker& broker_;
  int port_;
  std::atomic<bool> running_{false};
  mutable std::mutex ticks_mutex_;
  std::deque<json> recent_ticks_;
  static constexpr size_t MAX_TICKS = 200;
  std::string current_run_id_;
  std::unique_ptr<std::thread> ws_thread_;
  
  // Persistent storage for candles and events (shared with CandlePersister)
  std::shared_ptr<eng::CandleStore> candle_store_;
  
  // NOTE: Candle persistence moved to CandlePersister component
  // No longer tracking flush counters here
  
  // WebSocket server state
  mutable std::mutex ws_mutex_;
  std::unique_ptr<WebSocketServerType> ws_server_;
  std::set<connection_ptr> ws_connections_;

  // Convert Tick to JSON and broadcast to all connected clients
  void on_provider_tick(const eng::Tick& tick);
  void on_order_placed(const eng::Order& order);
  void on_order_filled(const eng::Order& order);
  void on_order_rejected(const eng::Order& order);
  void broadcast_to_clients(const json& msg);
  void emit_run_start();
  std::string generate_run_id() const;
  
  // Helper: convert TimePoint to ISO8601 string and millisecond epoch
  std::pair<std::string, long long> timepoint_to_iso_and_ms(const eng::TimePoint& tp);
  
  // WebSocket server thread function
  void run_ws_server();
  
  // Handle incoming WebSocket messages (queries, commands)
  void handle_ws_message(websocketpp::connection_hdl hdl, const json& msg);
  
  // RPC query handlers (send response to specific client)
  void handle_query_candles(websocketpp::connection_hdl hdl, const json& query, const std::string& request_id);
  void handle_query_events(websocketpp::connection_hdl hdl, const json& query, const std::string& request_id);
  void handle_query_balance(websocketpp::connection_hdl hdl, const std::string& request_id);
  void handle_query_positions(websocketpp::connection_hdl hdl, const std::string& request_id);
  void handle_query_orders(websocketpp::connection_hdl hdl, const std::string& request_id);
  void handle_query_default_viewport(websocketpp::connection_hdl hdl, const std::string& request_id);
};


} // namespace server
