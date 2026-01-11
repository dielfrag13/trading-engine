#pragma once

#include "engine/MarketDataTypes.hpp"
#include "engine/Types.hpp"
#include <sqlite3.h>
#include <nlohmann/json.hpp>
#include <vector>
#include <map>
#include <mutex>
#include <memory>
#include <string>

/*
CandleStore:
  Persistent SQLite storage + in-memory LRU cache for candles and events.
  
  Write path (during backtest):
    - Events/candles buffered in memory
    - Flushed to SQLite when buffers reach threshold (50K items)
    - Also broadcast via WebSocket (live update)
  
  Read path (frontend queries):
    - Check in-memory cache first (fast)
    - Fall back to SQLite (persistent)
    - Cache query results for future reuse
  
  Supports two data sources: 'live' (real-time trading) and 'backtest' (historical data)
*/

namespace eng {

using json = nlohmann::json;

struct CandleStoreConfig {
  std::string db_path{"backtest.db"};
  size_t candle_buffer_size{50000};   // Flush candles when buffer reaches this size
  size_t event_buffer_size{50000};    // Flush events when buffer reaches this size
  size_t max_candle_cache_entries{100};  // LRU limit for candle queries
  size_t max_event_cache_entries{100};   // LRU limit for event queries
};

struct StoredEvent {
  std::string event_type;      // 'OrderPlaced', 'OrderFilled', 'OrderRejected', etc.
  long long timestamp_ms{0};
  std::string symbol;
  std::string source;          // 'live' or 'backtest'
  json data;                   // Flexible JSON payload
};

class CandleStore {
public:
  explicit CandleStore(const CandleStoreConfig& config = CandleStoreConfig());
  ~CandleStore();

  // Initialize database schema (idempotent)
  void ensure_schema();

  // Write operations (buffered)
  void add_candle(const std::string& symbol, long long resolution_ms,
                  const Candle& candle, const std::string& source);
  
  void add_event(const std::string& event_type, long long timestamp_ms,
                 const std::string& symbol, const std::string& source,
                 const json& data);

  // Flush buffered writes to database
  void flush_all();
  void flush_candles();
  void flush_events();

  // Read operations (cache-aware)
  std::vector<Candle> query_candles(const std::string& symbol,
                                     long long resolution_ms,
                                     long long start_ms, long long end_ms);

  std::vector<StoredEvent> query_events(const std::string& symbol,
                                         long long start_ms, long long end_ms,
                                         const std::vector<std::string>& event_types = {});

  // Metadata queries
  json get_run_meta(const std::string& symbol) const;
  std::vector<json> list_runs(int limit = 20) const;

  // Clear all data (for starting fresh backtest)
  void clear_all();

private:
  CandleStoreConfig config_;
  sqlite3* db_{nullptr};
  
  // Thread safety
  std::mutex buffer_mutex_;
  std::mutex db_mutex_;
  std::mutex cache_mutex_;
  
  // Write buffers (accumulate before flushing to DB)
  std::vector<std::pair<std::string, Candle>> candles_write_buffer_;  // (symbol, candle)
  std::vector<std::pair<long long, std::string>> candles_resolution_buffer_;  // Track resolutions
  std::vector<StoredEvent> events_write_buffer_;

  // LRU caches
  struct CandleCacheKey {
    std::string symbol;
    long long resolution_ms;
    
    bool operator<(const CandleCacheKey& other) const {
      return std::tie(symbol, resolution_ms) < 
             std::tie(other.symbol, other.resolution_ms);
    }
  };
  
  struct EventCacheKey {
    std::string symbol;
    long long start_ms;
    long long end_ms;
    
    bool operator<(const EventCacheKey& other) const {
      return std::tie(symbol, start_ms, end_ms) < 
             std::tie(other.symbol, other.start_ms, other.end_ms);
    }
  };
  
  std::map<CandleCacheKey, std::vector<Candle>> candles_cache_;
  std::map<EventCacheKey, std::vector<StoredEvent>> events_cache_;

  // DB operations (must hold db_mutex_)
  void db_ensure_schema();
  void db_batch_insert_candles(const std::vector<std::pair<std::string, Candle>>& batch,
                                const std::vector<std::pair<long long, std::string>>& resolutions);
  void db_batch_insert_events(const std::vector<StoredEvent>& batch);
  
  std::vector<Candle> db_query_candles(const std::string& symbol,
                                        long long resolution_ms,
                                        long long start_ms, long long end_ms);
  
  std::vector<StoredEvent> db_query_events(const std::string& symbol,
                                            long long start_ms, long long end_ms,
                                            const std::vector<std::string>& event_types);

  // Cache management
  void evict_old_candle_cache();
  void evict_old_event_cache();

  // Utility
  void exec_sql(const std::string& sql);
  int query_int(const std::string& sql, int default_value = 0);
};

} // namespace eng
