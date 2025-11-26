#pragma once
#include "engine/EventBus.hpp"
#include "engine/MarketDataTypes.hpp"
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
  explicit FrontendBridge(eng::EventBus& bus, int port = 3000);
  ~FrontendBridge();

  // Start listening to EventBus and broadcasting ticks
  void start();

  // Stop the bridge
  void stop();

  // Get recent ticks (thread-safe)
  std::vector<json> get_recent_ticks(size_t limit = 100) const;

private:
  eng::EventBus& bus_;
  int port_;
  std::atomic<bool> running_{false};
  mutable std::mutex ticks_mutex_;
  std::deque<json> recent_ticks_;
  static constexpr size_t MAX_TICKS = 200;
  std::string current_run_id_;
  std::unique_ptr<std::thread> ws_thread_;
  
  // WebSocket server state
  mutable std::mutex ws_mutex_;
  std::unique_ptr<WebSocketServerType> ws_server_;
  std::set<connection_ptr> ws_connections_;

  // Convert Tick to JSON and broadcast to all connected clients
  void on_provider_tick(const eng::Tick& tick);
  void broadcast_to_clients(const json& msg);
  void emit_run_start();
  std::string generate_run_id() const;
  
  // WebSocket server thread function
  void run_ws_server();
};


} // namespace server
