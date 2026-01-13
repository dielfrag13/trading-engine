#include "server/FrontendBridge.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace server {

FrontendBridge::FrontendBridge(eng::EventBus& bus, eng::IBroker& broker, int port)
    : bus_(bus), broker_(broker), port_(port) {
  // Initialize persistent candle store (shared with CandlePersister)
  eng::CandleStoreConfig config;
  config.db_path = "backtest.db";
  config.candle_buffer_size = 100;  // Smaller buffer for frequent flushes (live-ready)
  config.event_buffer_size = 100;   // Match candle buffer size
  candle_store_ = std::make_shared<eng::CandleStore>(config);
}

FrontendBridge::~FrontendBridge() {
  // Flush any remaining candles before shutdown
  if (candle_store_) {
    std::cout << "[FrontendBridge] Destructor: flushing remaining candles\n";
    candle_store_->flush_all();
  }
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

  // NOTE: ChartCandle persistence is now handled by CandlePersister component
  // FrontendBridge focuses on query handling and WebSocket communication

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

  // Flush any buffered candles from the previous run
  if (candle_store_) {
    std::cout << "[FrontendBridge] Flushing candle store for new run\n";
    candle_store_->flush_all();
  }

  json run_start;
  run_start["type"] = "RunStart";
  run_start["data"]["runId"] = current_run_id_;
  
  auto now = std::chrono::system_clock::now();
  auto tp = std::chrono::system_clock::to_time_t(now);
  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
  run_start["data"]["timestamp"] = oss.str();
  
  // Include the starting balance from the broker
  double starting_balance = broker_.get_balance();
  run_start["data"]["startingBalance"] = starting_balance;
  std::cout << "[FrontendBridge] Emitting RunStart with starting balance: " << starting_balance << "\n";
  
  broadcast_to_clients(run_start);
}

void FrontendBridge::run_ws_server() {
  try {
    auto server = std::make_unique<WebSocketServerType>();

    // Disable WebSocket debug logging
    server->clear_access_channels(websocketpp::log::alevel::all);

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

    // Handle incoming messages (e.g., "clear" command, queries)
    server->set_message_handler([this](websocketpp::connection_hdl hdl, WebSocketServerType::message_ptr msg) {
      std::cout << "[FrontendBridge set_message_handler] Received message from client: " << msg->get_payload() << "\n";
      try {
        std::string payload = msg->get_payload();
        json command = json::parse(payload);
        
        if (command.contains("command") && command["command"] == "clear") {
          std::cout << "[FrontendBridge] Clear command received from client\n";
          // Generate a new run ID and emit RunStart to signal chart clear
          current_run_id_ = generate_run_id();
          emit_run_start();
        } else if (command.contains("type")) {
          // Route all Query messages to handler dispatcher
          std::string cmd_type = command["type"].get<std::string>();
          if (cmd_type == "QueryCandles" || cmd_type == "QueryEvents" || cmd_type == "QueryBalance" || 
              cmd_type == "QueryPositions" || cmd_type == "QueryOrders" || cmd_type == "QueryDefaultViewport") {
            handle_ws_message(hdl, command);
          } else {
            std::cerr << "[FrontendBridge] Unknown command type received from client: " << cmd_type << "\n";
          }
        } else {
          std::cerr << "[FrontendBridge] Malformed command received: missing 'command' and 'type' fields\n";
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
  // Store in persistent database
  if (candle_store_) {
    json event_data;
    event_data["orderId"] = order.id;
    event_data["symbol"] = order.symbol;
    event_data["qty"] = order.qty;
    event_data["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
    event_data["status"] = eng::order_status_to_string(order.status);
    
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        order.timestamp.time_since_epoch()).count();
    
    candle_store_->add_event("OrderPlaced", ms, order.symbol, "backtest", event_data);
  }

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
  // Store in persistent database
  if (candle_store_) {
    json event_data;
    event_data["orderId"] = order.id;
    event_data["symbol"] = order.symbol;
    event_data["filledQty"] = order.filled_qty;
    event_data["fillPrice"] = order.fill_price;
    event_data["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
    event_data["status"] = eng::order_status_to_string(order.status);
    
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        order.timestamp.time_since_epoch()).count();
    
    candle_store_->add_event("OrderFilled", ms, order.symbol, "backtest", event_data);
    
    // Flush immediately on order fills so frontend sees trades
    candle_store_->flush_all();
  }

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
  // Store in persistent database
  if (candle_store_) {
    json event_data;
    event_data["orderId"] = order.id;
    event_data["symbol"] = order.symbol;
    event_data["qty"] = order.qty;
    event_data["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
    event_data["reason"] = order.rejection_reason;
    
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        order.timestamp.time_since_epoch()).count();
    
    candle_store_->add_event("OrderRejected", ms, order.symbol, "backtest", event_data);
  }

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

void FrontendBridge::handle_ws_message(websocketpp::connection_hdl hdl, const json& msg) {
  try {
    std::string request_id = msg.contains("requestId") ? msg["requestId"].get<std::string>() : "";
    std::string msg_type = msg["type"].get<std::string>();

    std::cout << "[FrontendBridge] Received WebSocket message: type=" << msg_type << " requestId=" << request_id << "\n";

    if (msg_type == "QueryCandles") {
      handle_query_candles(hdl, msg, request_id);
    } else if (msg_type == "QueryEvents") {
      handle_query_events(hdl, msg, request_id);
    } else if (msg_type == "QueryBalance") {
      handle_query_balance(hdl, request_id);
    } else if (msg_type == "QueryPositions") {
      handle_query_positions(hdl, request_id);
    } else if (msg_type == "QueryOrders") {
      handle_query_orders(hdl, request_id);
    } else if (msg_type == "QueryDefaultViewport") {
      handle_query_default_viewport(hdl, request_id);
    } else {
      std::cerr << "[FrontendBridge] Unknown message type: " << msg_type << "\n";
    }
  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] Error handling WS message: " << e.what() << "\n";
    // Could send error response here
  }
}

void FrontendBridge::handle_query_candles(websocketpp::connection_hdl hdl, const json& query, const std::string& request_id) {
  json response;
  response["type"] = "QueryCandlesResponse";
  response["requestId"] = request_id;

  try {
    // Extract query parameters
    std::string symbol = query["data"]["symbol"].get<std::string>();
    long long resolution_ms = query["data"]["resolutionMs"].get<long long>();
    long long start_ms = query["data"]["startMs"].get<long long>();
    long long end_ms = query["data"]["endMs"].get<long long>();
    
    // Debug: print incoming query
    std::cout << "[FrontendBridge] QueryCandles received: " << symbol << " @ " << resolution_ms
              << "ms [" << start_ms << "-" << end_ms << "]\n";
    
    size_t limit = 10000;  // Default limit
    if (query["data"].contains("limit")) {
      limit = query["data"]["limit"].get<size_t>();
    }

    // Validate inputs
    if (symbol.empty()) {
      throw std::runtime_error("Symbol is required");
    }
    if (resolution_ms <= 0) {
      throw std::runtime_error("Resolution must be positive");
    }
    if (start_ms >= end_ms) {
      throw std::runtime_error("startMs must be less than endMs");
    }

    // ALWAYS query database at 1-second resolution (raw candles)
    auto raw_candles = candle_store_->query_candles(symbol, 1000, start_ms, end_ms);
    
    std::cout << "[FrontendBridge] QueryCandles: Retrieved " << raw_candles.size() 
              << " raw 1s candles from database\n";

    // Fill gaps in the candle data with forward-filled empty candles
    std::vector<eng::Candle> filled_candles = raw_candles;
    if (!filled_candles.empty()) {
      std::vector<eng::Candle> result_with_gaps;
      double last_close = filled_candles.front().open;  // Start with first candle's open price
      
      for (size_t i = 0; i < filled_candles.size(); ++i) {
        const auto& current = filled_candles[i];
        auto current_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            current.open_time.time_since_epoch()).count();
        
        // Fill gaps from previous candle (or start_ms for first candle)
        long long prev_ms = (i == 0) ? current_ms - 1000 : 
            std::chrono::duration_cast<std::chrono::milliseconds>(
                filled_candles[i-1].open_time.time_since_epoch()).count();
        
        // Create gap-filling candles
        for (long long gap_ms = prev_ms + 1000; gap_ms < current_ms; gap_ms += 1000) {
          eng::Candle gap_candle;
          gap_candle.symbol = symbol;
          gap_candle.open = last_close;
          gap_candle.high = last_close;
          gap_candle.low = last_close;
          gap_candle.close = last_close;
          gap_candle.volume = 0.0;
          gap_candle.open_time = std::chrono::system_clock::time_point(
              std::chrono::milliseconds(gap_ms));
          result_with_gaps.push_back(gap_candle);
        }
        
        result_with_gaps.push_back(current);
        last_close = current.close;  // Update last close for next gap
      }
      
      filled_candles = result_with_gaps;
      std::cout << "[FrontendBridge] QueryCandles: After gap-filling: " << filled_candles.size() 
                << " total 1s candles (including " << (filled_candles.size() - raw_candles.size()) 
                << " gap-fill candles)\n";
    }

    // Aggregate raw candles to requested resolution
    std::vector<eng::Candle> aggregated_candles;
    
    if (resolution_ms == 1000) {
      // No aggregation needed, use gap-filled candles as-is
      aggregated_candles = filled_candles;
    } else {
      // Aggregate candles by time buckets
      std::map<long long, std::vector<eng::Candle>> buckets;
      
      for (const auto& candle : filled_candles) {
        auto candle_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            candle.open_time.time_since_epoch()).count();
        
        // Floor timestamp to resolution boundary
        long long bucket_ms = (candle_ms / resolution_ms) * resolution_ms;
        buckets[bucket_ms].push_back(candle);
      }
      
      // Build aggregated candles from buckets
      for (const auto& [bucket_ms, bucket_candles] : buckets) {
        if (bucket_candles.empty()) continue;
        
        eng::Candle agg_candle;
        agg_candle.symbol = symbol;
        agg_candle.open = bucket_candles.front().open;
        agg_candle.close = bucket_candles.back().close;
        agg_candle.high = bucket_candles.front().high;
        agg_candle.low = bucket_candles.front().low;
        agg_candle.volume = 0.0;
        
        // Calculate high, low, volume
        for (const auto& c : bucket_candles) {
          if (c.high > agg_candle.high) agg_candle.high = c.high;
          if (c.low < agg_candle.low) agg_candle.low = c.low;
          agg_candle.volume += c.volume;
        }
        
        // Set timestamp to bucket start
        agg_candle.open_time = std::chrono::system_clock::time_point(
            std::chrono::milliseconds(bucket_ms));
        
        aggregated_candles.push_back(agg_candle);
      }
      
      // Sort by time (should already be sorted, but ensure it)
      std::sort(aggregated_candles.begin(), aggregated_candles.end(),
                [](const eng::Candle& a, const eng::Candle& b) {
                  return a.open_time < b.open_time;
                });
    }
    
    std::cout << "[FrontendBridge] QueryCandles: Aggregated to " << aggregated_candles.size() << " candles\n";

    // Check if results exceed limit
    bool is_truncated = false;
    if (aggregated_candles.size() > limit) {
      is_truncated = true;
      aggregated_candles.erase(aggregated_candles.begin() + limit, aggregated_candles.end());
    }

    // Build response
    response["data"]["symbol"] = symbol;
    response["data"]["resolutionMs"] = resolution_ms;
    response["data"]["candles"] = json::array();
    response["data"]["count"] = aggregated_candles.size();
    response["data"]["isTruncated"] = is_truncated;

    for (const auto& candle : aggregated_candles) {
      json candle_json;
      candle_json["symbol"] = candle.symbol;
      candle_json["open"] = candle.open;
      candle_json["high"] = candle.high;
      candle_json["low"] = candle.low;
      candle_json["close"] = candle.close;
      candle_json["volume"] = candle.volume;
      
      // Timestamps
      auto tp = std::chrono::system_clock::to_time_t(candle.open_time);
      std::ostringstream oss;
      oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
      candle_json["openTime"] = oss.str();
      
      auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
          candle.open_time.time_since_epoch()).count();
      candle_json["ms"] = ms;

      response["data"]["candles"].push_back(candle_json);
    }

    // Send response to THIS client only
    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      if (ws_server_) {
        try {
          ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
          std::cout << "[FrontendBridge] QueryCandlesResponse sent: " << aggregated_candles.size()
                    << " candles (truncated: " << is_truncated << ")\n";
        } catch (const std::exception& e) {
          std::cerr << "[FrontendBridge] Failed to send candles response: " << e.what() << "\n";
        }
      }
    }

  } catch (const std::exception& e) {
    // Send error response
    response["data"]["error"] = true;
    response["data"]["errorCode"] = "QUERY_ERROR";
    response["data"]["errorMessage"] = e.what();

    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      if (ws_server_) {
        try {
          ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
        } catch (const std::exception& e) {
          std::cerr << "[FrontendBridge] Failed to send error response: " << e.what() << "\n";
        }
      }
    }

    std::cerr << "[FrontendBridge] QueryCandles error: " << e.what() << "\n";
  }
}

void FrontendBridge::handle_query_events(websocketpp::connection_hdl hdl, const json& query, const std::string& request_id) {
  json response;
  response["type"] = "QueryEventsResponse";
  response["requestId"] = request_id;

  try {
    // Extract query parameters
    std::string symbol = query["data"]["symbol"].get<std::string>();
    long long start_ms = query["data"]["startMs"].get<long long>();
    long long end_ms = query["data"]["endMs"].get<long long>();
    size_t limit = 10000;  // Default limit
    if (query["data"].contains("limit")) {
      limit = query["data"]["limit"].get<size_t>();
    }

    // Extract optional event types filter
    std::vector<std::string> event_types;
    if (query["data"].contains("eventTypes") && query["data"]["eventTypes"].is_array()) {
      for (const auto& type : query["data"]["eventTypes"]) {
        event_types.push_back(type.get<std::string>());
      }
    }

    // Validate inputs
    if (symbol.empty()) {
      throw std::runtime_error("Symbol is required");
    }
    if (start_ms >= end_ms) {
      throw std::runtime_error("startMs must be less than endMs");
    }

    // Query database
    auto events = candle_store_->query_events(symbol, start_ms, end_ms, event_types);

    // Check if results exceed limit
    bool is_truncated = false;
    if (events.size() > limit) {
      is_truncated = true;
      events.erase(events.begin() + limit, events.end());
    }

    // Build response
    response["data"]["symbol"] = symbol;
    response["data"]["events"] = json::array();
    response["data"]["count"] = events.size();
    response["data"]["isTruncated"] = is_truncated;

    for (const auto& event : events) {
      json event_json;
      event_json["eventType"] = event.event_type;
      event_json["timestampMs"] = event.timestamp_ms;
      event_json["symbol"] = event.symbol;
      event_json["source"] = event.source;
      event_json["data"] = event.data;

      response["data"]["events"].push_back(event_json);
    }

    // Send response to THIS client only
    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      if (ws_server_) {
        try {
          ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
        } catch (const std::exception& e) {
          std::cerr << "[FrontendBridge] Failed to send events response: " << e.what() << "\n";
        }
      }
    }

    std::cout << "[FrontendBridge] QueryEvents: " << symbol << " [" << start_ms << "-" << end_ms
              << "], returned " << events.size() << " events (truncated: " << is_truncated << ")\n";

  } catch (const std::exception& e) {
    // Send error response
    response["data"]["error"] = true;
    response["data"]["errorCode"] = "QUERY_ERROR";
    response["data"]["errorMessage"] = e.what();

    {
      std::lock_guard<std::mutex> lock(ws_mutex_);
      if (ws_server_) {
        try {
          ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
        } catch (const std::exception& e) {
          std::cerr << "[FrontendBridge] Failed to send error response: " << e.what() << "\n";
        }
      }
    }

    std::cerr << "[FrontendBridge] QueryEvents error: " << e.what() << "\n";
  }
}

void FrontendBridge::handle_query_balance(websocketpp::connection_hdl hdl, const std::string& request_id) {
  try {
    double balance = broker_.get_balance();
    
    json response;
    response["type"] = "QueryBalanceResponse";
    response["requestId"] = request_id;
    response["data"]["balance"] = balance;
    
    std::cout << "[FrontendBridge] QueryBalance response sent: balance=" << balance << "\n";
    
    ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] QueryBalance error: " << e.what() << "\n";
    
    try {
      json error_response;
      error_response["type"] = "QueryBalanceResponse";
      error_response["requestId"] = request_id;
      error_response["error"] = e.what();
      
      ws_server_->send(hdl, error_response.dump(), websocketpp::frame::opcode::text);
    } catch (const std::exception& e2) {
      std::cerr << "[FrontendBridge] Failed to send error response: " << e2.what() << "\n";
    }
  }
}

void FrontendBridge::handle_query_positions(websocketpp::connection_hdl hdl, const std::string& request_id) {
  try {
    auto positions = broker_.get_positions();
    
    json response;
    response["type"] = "QueryPositionsResponse";
    response["requestId"] = request_id;
    response["data"] = json::array();
    
    for (const auto& [symbol, qty] : positions) {
      if (qty != 0.0) {  // Only include non-zero positions
        json pos;
        pos["symbol"] = symbol;
        pos["qty"] = qty;
        response["data"].push_back(pos);
      }
    }
    
    std::cout << "[FrontendBridge] QueryPositions response sent: " << response["data"].size() << " positions\n";
    
    ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] QueryPositions error: " << e.what() << "\n";
    
    try {
      json error_response;
      error_response["type"] = "QueryPositionsResponse";
      error_response["requestId"] = request_id;
      error_response["error"] = e.what();
      
      ws_server_->send(hdl, error_response.dump(), websocketpp::frame::opcode::text);
    } catch (const std::exception& e2) {
      std::cerr << "[FrontendBridge] Failed to send error response: " << e2.what() << "\n";
    }
  }
}

void FrontendBridge::handle_query_orders(websocketpp::connection_hdl hdl, const std::string& request_id) {
  try {
    auto orders = broker_.get_orders();
    
    json response;
    response["type"] = "QueryOrdersResponse";
    response["requestId"] = request_id;
    response["data"] = json::array();
    
    // Convert each order to JSON
    for (const auto& order : orders) {
      json order_json;
      order_json["orderId"] = order.id;
      order_json["symbol"] = order.symbol;
      order_json["qty"] = order.qty;
      order_json["side"] = (order.side == eng::Order::Side::Buy) ? "Buy" : "Sell";
      order_json["status"] = eng::order_status_to_string(order.status);
      order_json["filledQty"] = order.filled_qty;
      order_json["fillPrice"] = order.fill_price;
      
      // Add timestamp
      auto tp = std::chrono::system_clock::to_time_t(order.timestamp);
      std::ostringstream ts_oss;
      ts_oss << std::put_time(std::gmtime(&tp), "%Y-%m-%dT%H:%M:%SZ");
      order_json["timestamp"] = ts_oss.str();
      
      // Add rejection reason if present
      if (!order.rejection_reason.empty()) {
        order_json["rejectionReason"] = order.rejection_reason;
      }
      
      response["data"].push_back(order_json);
    }
    
    std::cout << "[FrontendBridge] QueryOrders response sent: " << response["data"].size() << " orders\n";
    
    ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] QueryOrders error: " << e.what() << "\n";
    
    try {
      json error_response;
      error_response["type"] = "QueryOrdersResponse";
      error_response["requestId"] = request_id;
      error_response["error"] = e.what();
      
      ws_server_->send(hdl, error_response.dump(), websocketpp::frame::opcode::text);
    } catch (const std::exception& e2) {
      std::cerr << "[FrontendBridge] Failed to send error response: " << e2.what() << "\n";
    }
  }
}

void FrontendBridge::handle_query_default_viewport(websocketpp::connection_hdl hdl, const std::string& request_id) {
  try {
    json response;
    response["type"] = "QueryDefaultViewportResponse";
    response["requestId"] = request_id;

    // Query the database for available time range of BTCUSD
    // Use a very wide time range to find ANY data (handles both live and backtest data)
    // Backtest data will have historical timestamps, not current timestamps
    long long start_range = 0; // From Unix epoch (1970)
    auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    long long end_range = now_ms + (365LL * 24 * 60 * 60 * 1000); // Up to 1 year in future
    
    std::cout << "[FrontendBridge] QueryDefaultViewport: Querying for BTCUSD, resolution=1000ms, range=" 
              << start_range << " to " << end_range << "\n";
    auto candles = candle_store_->query_candles("BTCUSD", 1000, start_range, end_range);
    std::cout << "[FrontendBridge] QueryDefaultViewport: Query returned " << candles.size() << " candles\n";
    
    if (candles.empty()) {
      // No data available yet - return error status
      response["error"] = "NoDataYet";
      std::cout << "[FrontendBridge] QueryDefaultViewport: No data available in database, returning NoDataYet\n";
    } else {
      // Data exists! Return the range covered by the data
      // Use the earliest and latest candle timestamps
      long long earliest_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
          candles.front().open_time.time_since_epoch()).count();
      long long latest_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
          candles.back().open_time.time_since_epoch()).count();
      
      std::cout << "[FrontendBridge] QueryDefaultViewport: Data range from " << earliest_ms 
                << " to " << latest_ms << " (span: " << (latest_ms - earliest_ms) / 1000.0 << " seconds)\n";
      
      // For better UX, show the last 24 hours if we have more than that
      long long one_day_ms = 24 * 60 * 60 * 1000LL;
      long long start_ms = std::max(earliest_ms, latest_ms - one_day_ms);
      long long end_ms = latest_ms + 1000; // Add 1 second buffer at the end
      
      response["data"]["symbol"] = "BTCUSD";
      response["data"]["startMs"] = start_ms;
      response["data"]["endMs"] = end_ms;
      
      std::cout << "[FrontendBridge] QueryDefaultViewport: Returning viewport " << start_ms 
                << " to " << end_ms << "\n";
    }

    ws_server_->send(hdl, response.dump(), websocketpp::frame::opcode::text);
  } catch (const std::exception& e) {
    std::cerr << "[FrontendBridge] QueryDefaultViewport error: " << e.what() << "\n";
    
    try {
      json error_response;
      error_response["type"] = "QueryDefaultViewportResponse";
      error_response["requestId"] = request_id;
      error_response["error"] = e.what();
      
      ws_server_->send(hdl, error_response.dump(), websocketpp::frame::opcode::text);
    } catch (const std::exception& e2) {
      std::cerr << "[FrontendBridge] Failed to send error response: " << e2.what() << "\n";
    }
  }
}
} // namespace server
