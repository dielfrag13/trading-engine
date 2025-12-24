#include "server/FrontendBridge.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace server {

FrontendBridge::FrontendBridge(eng::EventBus& bus, int port)
    : bus_(bus), port_(port) {}

FrontendBridge::~FrontendBridge() {
  stop();
}

void FrontendBridge::start() {
  if (running_.exchange(true)) return;

  // Generate a unique run ID for this session
  current_run_id_ = generate_run_id();
  
  // Subscribe to ProviderTick events on the bus
  bus_.subscribe("ProviderTick", [this](const eng::Event& ev) {
    try {
      auto tick = std::any_cast<eng::Tick>(ev.data);
      on_provider_tick(tick);
    } catch (const std::bad_any_cast&) {
      std::cerr << "[FrontendBridge] Failed to cast ProviderTick event\n";
    }
  });

  // Subscribe to ChartCandle events (coalesced OHLCV data for visualization)
  bus_.subscribe("ChartCandle", [this](const eng::Event& ev) {
    try {
      auto candle = std::any_cast<eng::Candle>(ev.data);
      on_chart_candle(candle);
    } catch (const std::bad_any_cast&) {
      std::cerr << "[FrontendBridge] Failed to cast ChartCandle event\n";
    }
  });

  // Subscribe to OrderPlaced events
  bus_.subscribe("OrderPlaced", [this](const eng::Event& ev) {
    try {
      auto order = std::any_cast<eng::Order>(ev.data);
      on_order_placed(order);
    } catch (const std::bad_any_cast&) {
      std::cerr << "[FrontendBridge] Failed to cast OrderPlaced event\n";
    }
  });

  // Subscribe to OrderFilled events
  bus_.subscribe("OrderFilled", [this](const eng::Event& ev) {
    try {
      auto order = std::any_cast<eng::Order>(ev.data);
      on_order_filled(order);
    } catch (const std::bad_any_cast&) {
      std::cerr << "[FrontendBridge] Failed to cast OrderFilled event\n";
    }
  });

  // Subscribe to OrderRejected events
  bus_.subscribe("OrderRejected", [this](const eng::Event& ev) {
    try {
      auto order = std::any_cast<eng::Order>(ev.data);
      on_order_rejected(order);
    } catch (const std::bad_any_cast&) {
      std::cerr << "[FrontendBridge] Failed to cast OrderRejected event\n";
    }
  });

  // Start WebSocket server in a separate thread
  ws_thread_ = std::make_unique<std::thread>([this]() {
    run_ws_server();
  });

  std::cout << "[FrontendBridge] WebSocket server starting on port " << port_ << "\n";
  std::cout << "[FrontendBridge] Run ID: " << current_run_id_ << "\n";
  
  // Give the WebSocket server a moment to start
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  
  // Emit RunStart event to mark the beginning of a new run
  emit_run_start();
}

void FrontendBridge::stop() {
  if (!running_.exchange(false)) return;
  
  // Stop the WebSocket server
  {
    std::lock_guard<std::mutex> lock(ws_mutex_);
    if (ws_server_) {
      try {
        ws_server_->stop_listening();
        ws_server_->stop();  // Explicitly stop the ASIO service
      } catch (const std::exception& e) {
        std::cerr << "[FrontendBridge] Error stopping server: " << e.what() << "\n";
      }
      ws_connections_.clear();
    }
  }
  
  // Wait for server thread to finish with a timeout
  if (ws_thread_ && ws_thread_->joinable()) {
    ws_thread_->join();
  }
  
  std::cout << "[FrontendBridge] Server stopped\n";
}

std::vector<json> FrontendBridge::get_recent_ticks(size_t limit) const {
  std::lock_guard<std::mutex> lock(ticks_mutex_);
  std::vector<json> result;
  size_t count = std::min(limit, recent_ticks_.size());
  auto it = recent_ticks_.rbegin();
  for (size_t i = 0; i < count && it != recent_ticks_.rend(); ++i, ++it) {
    result.insert(result.begin(), *it);
  }
  return result;
}

void FrontendBridge::on_provider_tick(const eng::Tick& tick) {
  // DISABLED: ProviderTick events are no longer sent to frontend.
  // The frontend receives only ChartCandle events from the ChartAggregator.
  // This prevents the frontend from being flooded with thousands of individual ticks
  // and reduces network bandwidth by ~1000x in backtest mode.
  //
  // Raw tick data still flows through the engine and to strategies for accuracy.
  // Only the aggregated candles are sent for visualization.
  
  // To re-enable if needed:
  // json msg;
  // msg["type"] = "ProviderTick";
  // msg["data"]["symbol"] = tick.symbol;
  // msg["data"]["price"] = tick.last;
  // msg["data"]["ms"] = std::chrono::duration_cast<std::chrono::milliseconds>(
  //     tick.ts.time_since_epoch()).count();
  // broadcast_to_clients(msg);
}

void FrontendBridge::on_chart_candle(const eng::Candle& candle) {
  json msg;
  msg["type"] = "ChartCandle";
  msg["data"]["symbol"] = candle.symbol;
  msg["data"]["open"] = candle.open;
  msg["data"]["high"] = candle.high;
  msg["data"]["low"] = candle.low;
  msg["data"]["close"] = candle.close;
  msg["data"]["volume"] = candle.volume;
  
  // Include both ISO8601 timestamp and millisecond epoch for frontend
  auto tp = std::chrono::system_clock::to_time_t(candle.open_time);
  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
  msg["data"]["open_time"] = oss.str();
  
  // Millisecond precision for viewport calculations and chart positioning
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      candle.open_time.time_since_epoch()).count();
  msg["data"]["ms"] = ms;

  // Debug: log first few candles to verify timestamps
  static int candle_count = 0;
  if (candle_count < 5000000) {
    std::cout << "[FrontendBridge] ChartCandle #" << candle_count << ": symbol=" << candle.symbol
              << " open_time=" << oss.str() << " ms=" << ms
              << " (date: " << std::chrono::system_clock::to_time_t(candle.open_time) << ")\n";
    candle_count++;
  }

  broadcast_to_clients(msg);
}

void FrontendBridge::broadcast_to_clients(const json& msg) {
  // Store tick in memory queue
  {
    std::lock_guard<std::mutex> lock(ticks_mutex_);
    recent_ticks_.push_back(msg);
    if (recent_ticks_.size() > MAX_TICKS) {
      recent_ticks_.pop_front();
    }
  }

  // Broadcast to all connected WebSocket clients
  {
    std::lock_guard<std::mutex> lock(ws_mutex_);
    if (ws_server_) {
      std::string payload = msg.dump();
      for (auto& conn : ws_connections_) {
        try {
          ws_server_->send(conn, payload, websocketpp::frame::opcode::text);
        } catch (const std::exception& e) {
          std::cerr << "[FrontendBridge] Failed to send to client: " << e.what() << "\n";
        }
      }
    }
  }

  // Log to stdout for debugging
  std::cout << "[WS] " << msg.dump() << "\n";
}

// Helper: convert TimePoint to both ISO8601 string and millisecond epoch
// Returns pair of (iso_string, milliseconds)
std::pair<std::string, long long> FrontendBridge::timepoint_to_iso_and_ms(const eng::TimePoint& tp) {
  // Convert to time_t for ISO8601 formatting
  auto time_t_val = std::chrono::system_clock::to_time_t(tp);
  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&time_t_val), "%Y-%m-%dT%H:%M:%SZ");
  
  // Convert to millisecond epoch
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(tp.time_since_epoch()).count();
  
  return {oss.str(), ms};
}

std::string FrontendBridge::generate_run_id() const {
  auto now = std::chrono::system_clock::now();
  auto time_t_now = std::chrono::system_clock::to_time_t(now);
  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&time_t_now), "%Y%m%d_%H%M%S");
  return oss.str();
}

void FrontendBridge::emit_run_start() {
  // Clear the recent ticks buffer to start fresh with new run
  {
    std::lock_guard<std::mutex> lock(ticks_mutex_);
    recent_ticks_.clear();
  }

  json run_start;
  run_start["type"] = "RunStart";
  run_start["data"]["runId"] = current_run_id_;
  
  auto now = std::chrono::system_clock::now();
  auto tp = std::chrono::system_clock::to_time_t(now);
  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
  run_start["data"]["timestamp"] = oss.str();
  
  broadcast_to_clients(run_start);
}

void FrontendBridge::run_ws_server() {
  try {
    auto server = std::make_unique<WebSocketServerType>();

    // Set up logging if needed
    server->set_access_channels(websocketpp::log::alevel::all);
    server->clear_access_channels(websocketpp::log::alevel::frame_payload);

    // Initialize ASIO
    server->init_asio();
    server->set_reuse_addr(true);

    // Handle new connections
    server->set_open_handler([this](websocketpp::connection_hdl hdl) {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      auto conn = ws_server_->get_con_from_hdl(hdl);
      ws_connections_.insert(conn);
      std::cout << "[FrontendBridge] Client connected. Total clients: " << ws_connections_.size() << "\n";
      
      // Send current run ID so client knows which run it's in
      json run_start;
      run_start["type"] = "RunStart";
      run_start["data"]["runId"] = current_run_id_;
      
      auto now = std::chrono::system_clock::now();
      auto tp = std::chrono::system_clock::to_time_t(now);
      std::ostringstream oss;
      oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
      run_start["data"]["timestamp"] = oss.str();
      
      try {
        ws_server_->send(hdl, run_start.dump(), websocketpp::frame::opcode::text);
      } catch (const std::exception& e) {
        std::cerr << "[FrontendBridge] Failed to send RunStart on connection: " << e.what() << "\n";
      }
      // Don't send historical ticks - only forward new ticks from this point on
    });

    // Handle client disconnect
    server->set_close_handler([this](websocketpp::connection_hdl hdl) {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      auto it = ws_connections_.begin();
      while (it != ws_connections_.end()) {
        if ((*it)->get_handle().lock() == hdl.lock()) {
          it = ws_connections_.erase(it);
        } else {
          ++it;
        }
      }
      std::cout << "[FrontendBridge] Client disconnected. Total clients: " << ws_connections_.size() << "\n";
    });

    // Handle incoming messages (e.g., "clear" command)
    server->set_message_handler([this](websocketpp::connection_hdl hdl, WebSocketServerType::message_ptr msg) {
      try {
        std::string payload = msg->get_payload();
        json command = json::parse(payload);
        
        if (command.contains("command") && command["command"] == "clear") {
          std::cout << "[FrontendBridge] Clear command received from client\n";
          // Generate a new run ID and emit RunStart to signal chart clear
          current_run_id_ = generate_run_id();
          emit_run_start();
        }
      } catch (const std::exception& e) {
        std::cerr << "[FrontendBridge] Failed to parse incoming message: " << e.what() << "\n";
      }
    });

    // Listen on the specified port
    server->listen(websocketpp::lib::asio::ip::tcp::v4(), port_);
    server->start_accept();

    // Store server instance
    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      ws_server_ = std::move(server);
    }

    std::cout << "[FrontendBridge] WebSocket listening on ws://localhost:" << port_ << "\n";

    // Run the server (blocks until stop_listening() is called)
    ws_server_->run();

    // Cleanup
    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      ws_server_ = nullptr;
      ws_connections_.clear();
    }

  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] WebSocket server error: " << e.what() << "\n";
  }
}

void FrontendBridge::on_order_placed(const eng::Order& order) {
  json msg;
  msg["type"] = "OrderPlaced";
  msg["data"]["orderId"] = order.id;
  msg["data"]["symbol"] = order.symbol;
  msg["data"]["qty"] = order.qty;
  msg["data"]["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
  msg["data"]["status"] = eng::order_status_to_string(order.status);
  
  // Use order's event_time instead of wall-clock time for backtesting consistency
  auto [timestamp_iso, ms] = timepoint_to_iso_and_ms(order.timestamp);
  msg["data"]["timestamp"] = timestamp_iso;
  msg["data"]["ms"] = ms;

  broadcast_to_clients(msg);
}

void FrontendBridge::on_order_filled(const eng::Order& order) {
  json msg;
  msg["type"] = "OrderFilled";
  msg["data"]["orderId"] = order.id;
  msg["data"]["symbol"] = order.symbol;
  msg["data"]["filledQty"] = order.filled_qty;
  msg["data"]["fillPrice"] = order.fill_price;
  msg["data"]["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
  msg["data"]["status"] = eng::order_status_to_string(order.status);
  
  // Use order's event_time instead of wall-clock time for backtesting consistency
  auto [timestamp_iso, ms] = timepoint_to_iso_and_ms(order.timestamp);
  msg["data"]["timestamp"] = timestamp_iso;
  msg["data"]["ms"] = ms;

  broadcast_to_clients(msg);
}

void FrontendBridge::on_order_rejected(const eng::Order& order) {
  json msg;
  msg["type"] = "OrderRejected";
  msg["data"]["orderId"] = order.id;
  msg["data"]["symbol"] = order.symbol;
  msg["data"]["qty"] = order.qty;
  msg["data"]["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
  msg["data"]["reason"] = order.rejection_reason;
  
  // Use order's event_time instead of wall-clock time for backtesting consistency
  auto [timestamp_iso, ms] = timepoint_to_iso_and_ms(order.timestamp);
  msg["data"]["timestamp"] = timestamp_iso;
  msg["data"]["ms"] = ms;

  broadcast_to_clients(msg);
}

} // namespace server
