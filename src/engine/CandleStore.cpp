#include "engine/CandleStore.hpp"
#include <iostream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <stdexcept>

namespace eng {

CandleStore::CandleStore(const CandleStoreConfig& config)
    : config_(config) {
  int rc = sqlite3_open(config_.db_path.c_str(), &db_);
  if (rc != SQLITE_OK) {
    std::string msg = "Failed to open database: " + std::string(sqlite3_errmsg(db_));
    if (db_) sqlite3_close(db_);
    throw std::runtime_error(msg);
  }
  
  std::cout << "[CandleStore] Opened database: " << config_.db_path << "\n";
  ensure_schema();
}

CandleStore::~CandleStore() {
  try {
    flush_all();
  } catch (const std::exception& e) {
    std::cerr << "[CandleStore] Error flushing on shutdown: " << e.what() << "\n";
  }
  
  if (db_) {
    sqlite3_close(db_);
    std::cout << "[CandleStore] Closed database\n";
  }
}

void CandleStore::ensure_schema() {
  std::lock_guard<std::mutex> lock(db_mutex_);
  db_ensure_schema();
}

void CandleStore::db_ensure_schema() {
  // Performance pragmas
  exec_sql("PRAGMA journal_mode=WAL;");
  exec_sql("PRAGMA synchronous=NORMAL;");
  exec_sql("PRAGMA foreign_keys=ON;");
  exec_sql("PRAGMA cache_size=50000;");
  exec_sql("PRAGMA temp_store=MEMORY;");
  exec_sql("PRAGMA busy_timeout=5000;");

  // Schema version tracking
  exec_sql("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);");

  int v = query_int("SELECT version FROM schema_version LIMIT 1;", 0);

  exec_sql("BEGIN;");
  try {
    if (v < 1) {
      // Candles table: OHLCV data at various resolutions
      exec_sql(R"SQL(
        CREATE TABLE IF NOT EXISTS candles(
          symbol TEXT NOT NULL,
          resolution_ms INTEGER NOT NULL,
          open_time_ms INTEGER NOT NULL,
          source TEXT NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          trade_count INTEGER,
          ingestion_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(symbol, resolution_ms, open_time_ms, source)
        );
      )SQL");

      // Fast queries by symbol, resolution, and time range
      exec_sql(R"SQL(
        CREATE INDEX IF NOT EXISTS idx_candles_query 
        ON candles(symbol, resolution_ms, open_time_ms);
      )SQL");

      // Track which data is live vs backtest
      exec_sql(R"SQL(
        CREATE INDEX IF NOT EXISTS idx_candles_by_source 
        ON candles(source, open_time_ms);
      )SQL");

      // Events table: flexible JSON storage for OrderPlaced, OrderFilled, etc.
      exec_sql(R"SQL(
        CREATE TABLE IF NOT EXISTS events(
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          timestamp_ms INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          source TEXT NOT NULL,
          data TEXT NOT NULL,
          ingestion_time DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      )SQL");

      // Fast queries by symbol and time range
      exec_sql(R"SQL(
        CREATE INDEX IF NOT EXISTS idx_events_query 
        ON events(symbol, timestamp_ms);
      )SQL");

      // Filter by event type
      exec_sql(R"SQL(
        CREATE INDEX IF NOT EXISTS idx_events_by_type 
        ON events(event_type, symbol);
      )SQL");

      // Track ingestion time for debugging/cleanup
      exec_sql(R"SQL(
        CREATE INDEX IF NOT EXISTS idx_events_ingestion 
        ON events(ingestion_time);
      )SQL");

      // Sources reference table
      exec_sql(R"SQL(
        CREATE TABLE IF NOT EXISTS sources(
          source_id TEXT PRIMARY KEY,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      )SQL");

      // Seed default sources
      exec_sql("INSERT OR IGNORE INTO sources(source_id, description) VALUES('live', 'Real-time live trading');");
      exec_sql("INSERT OR IGNORE INTO sources(source_id, description) VALUES('backtest', 'Historical backtest data');");

      exec_sql("DELETE FROM schema_version;");
      exec_sql("INSERT INTO schema_version(version) VALUES (1);");
      v = 1;
      
      std::cout << "[CandleStore] Schema initialized (v1)\n";
    }

    exec_sql("COMMIT;");
  } catch (const std::exception& e) {
    exec_sql("ROLLBACK;");
    throw;
  }
}

void CandleStore::add_candle(const std::string& symbol, long long resolution_ms,
                             const Candle& candle, const std::string& source) {
  {
    std::lock_guard<std::mutex> lock(buffer_mutex_);
    // append a copy of a candle to the write_buffer.
    candles_write_buffer_.push_back({symbol, candle});
    // why do we track separate resolutions?
    candles_resolution_buffer_.push_back({resolution_ms, symbol});
  }

  if (candles_write_buffer_.size() >= config_.candle_buffer_size) {
    flush_candles();
  }
}

void CandleStore::add_event(const std::string& event_type, long long timestamp_ms,
                            const std::string& symbol, const std::string& source,
                            const json& data) {
  {
    std::lock_guard<std::mutex> lock(buffer_mutex_);
    events_write_buffer_.push_back({event_type, timestamp_ms, symbol, source, data});
  }

  if (events_write_buffer_.size() >= config_.event_buffer_size) {
    flush_events();
  }
}

void CandleStore::flush_all() {
  flush_candles();
  flush_events();
}

void CandleStore::flush_candles() {
  std::vector<std::pair<std::string, Candle>> to_flush;
  std::vector<std::pair<long long, std::string>> resolutions;
  {
    std::lock_guard<std::mutex> lock(buffer_mutex_);
    to_flush = std::move(candles_write_buffer_);
    resolutions = std::move(candles_resolution_buffer_);
    candles_write_buffer_.clear();
    candles_resolution_buffer_.clear();
  }

  if (to_flush.empty()) return;

  {
    std::lock_guard<std::mutex> lock(db_mutex_);
    db_batch_insert_candles(to_flush, resolutions);
  }

  std::cout << "[CandleStore] Flushed " << to_flush.size() << " candles to DB\n";
}

void CandleStore::flush_events() {
  std::vector<StoredEvent> to_flush;
  {
    std::lock_guard<std::mutex> lock(buffer_mutex_);
    to_flush = std::move(events_write_buffer_);
    events_write_buffer_.clear();
  }

  if (to_flush.empty()) return;

  {
    std::lock_guard<std::mutex> lock(db_mutex_);
    db_batch_insert_events(to_flush);
  }

  std::cout << "[CandleStore] Flushed " << to_flush.size() << " events to DB\n";
}

void CandleStore::db_batch_insert_candles(
    const std::vector<std::pair<std::string, Candle>>& batch,
    const std::vector<std::pair<long long, std::string>>& resolutions) {
  if (batch.empty()) return;

  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"SQL(
    INSERT INTO candles(symbol, resolution_ms, open_time_ms, source, open, high, low, close, volume, trade_count)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  )SQL";

  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    throw std::runtime_error(std::string("Failed to prepare statement: ") + sqlite3_errmsg(db_));
  }

  exec_sql("BEGIN TRANSACTION;");
  try {
    for (size_t i = 0; i < batch.size(); ++i) {
      const auto& [symbol, candle] = batch[i];
      const auto& [resolution_ms, _] = resolutions[i];
      
      auto open_time_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
          candle.open_time.time_since_epoch()).count();

      sqlite3_bind_text(stmt, 1, symbol.c_str(), -1, SQLITE_STATIC);
      sqlite3_bind_int64(stmt, 2, resolution_ms);
      sqlite3_bind_int64(stmt, 3, open_time_ms);
      sqlite3_bind_text(stmt, 4, "backtest", -1, SQLITE_STATIC);  // Source
      sqlite3_bind_double(stmt, 5, candle.open);
      sqlite3_bind_double(stmt, 6, candle.high);
      sqlite3_bind_double(stmt, 7, candle.low);
      sqlite3_bind_double(stmt, 8, candle.close);
      sqlite3_bind_double(stmt, 9, candle.volume);
      sqlite3_bind_int(stmt, 10, 0);  // trade_count (optional)

      rc = sqlite3_step(stmt);
      if (rc != SQLITE_DONE) {
        throw std::runtime_error(std::string("Failed to insert candle: ") + sqlite3_errmsg(db_));
      }
      sqlite3_reset(stmt);
    }
    exec_sql("COMMIT;");
  } catch (const std::exception& e) {
    exec_sql("ROLLBACK;");
    sqlite3_finalize(stmt);
    throw;
  }
  sqlite3_finalize(stmt);
}

void CandleStore::db_batch_insert_events(const std::vector<StoredEvent>& batch) {
  if (batch.empty()) return;

  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"SQL(
    INSERT INTO events(event_type, timestamp_ms, symbol, source, data)
    VALUES(?, ?, ?, ?, ?);
  )SQL";

  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    throw std::runtime_error(std::string("Failed to prepare statement: ") + sqlite3_errmsg(db_));
  }

  exec_sql("BEGIN TRANSACTION;");
  try {
    for (const auto& event : batch) {
      sqlite3_bind_text(stmt, 1, event.event_type.c_str(), -1, SQLITE_STATIC);
      sqlite3_bind_int64(stmt, 2, event.timestamp_ms);
      sqlite3_bind_text(stmt, 3, event.symbol.c_str(), -1, SQLITE_STATIC);
      sqlite3_bind_text(stmt, 4, event.source.c_str(), -1, SQLITE_STATIC);
      
      std::string data_str = event.data.dump();
      sqlite3_bind_text(stmt, 5, data_str.c_str(), -1, SQLITE_TRANSIENT);

      rc = sqlite3_step(stmt);
      if (rc != SQLITE_DONE) {
        throw std::runtime_error(std::string("Failed to insert event: ") + sqlite3_errmsg(db_));
      }
      sqlite3_reset(stmt);
    }
    exec_sql("COMMIT;");
  } catch (const std::exception& e) {
    exec_sql("ROLLBACK;");
    sqlite3_finalize(stmt);
    throw;
  }
  sqlite3_finalize(stmt);
}

std::vector<Candle> CandleStore::query_candles(const std::string& symbol,
                                                long long resolution_ms,
                                                long long start_ms, long long end_ms) {
  CandleCacheKey key{symbol, resolution_ms};

  // Check cache first
  {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    if (candles_cache_.count(key)) {
      auto& cached = candles_cache_[key];
      // Filter by time range
      std::vector<Candle> result;
      for (const auto& candle : cached) {
        auto candle_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            candle.open_time.time_since_epoch()).count();
        if (candle_ms >= start_ms && candle_ms <= end_ms) {
          result.push_back(candle);
        }
      }
      if (!result.empty()) return result;  // Cache hit!
    }
  }

  // Cache miss: query database
  auto result = [this, &symbol, resolution_ms, start_ms, end_ms]() {
    std::lock_guard<std::mutex> lock(db_mutex_);
    return db_query_candles(symbol, resolution_ms, start_ms, end_ms);
  }();

  // Cache the full result for this resolution
  {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    candles_cache_[key] = result;
    evict_old_candle_cache();
  }

  return result;
}

std::vector<Candle> CandleStore::db_query_candles(const std::string& symbol,
                                                   long long resolution_ms,
                                                   long long start_ms, long long end_ms) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"SQL(
    SELECT open_time_ms, open, high, low, close, volume, trade_count
    FROM candles
    WHERE symbol = ? AND resolution_ms = ? AND open_time_ms BETWEEN ? AND ?
    ORDER BY open_time_ms ASC;
  )SQL";

  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    throw std::runtime_error(std::string("Failed to prepare query: ") + sqlite3_errmsg(db_));
  }

  sqlite3_bind_text(stmt, 1, symbol.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int64(stmt, 2, resolution_ms);
  sqlite3_bind_int64(stmt, 3, start_ms);
  sqlite3_bind_int64(stmt, 4, end_ms);

  std::vector<Candle> result;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    long long open_time_ms = sqlite3_column_int64(stmt, 0);
    double open = sqlite3_column_double(stmt, 1);
    double high = sqlite3_column_double(stmt, 2);
    double low = sqlite3_column_double(stmt, 3);
    double close = sqlite3_column_double(stmt, 4);
    double volume = sqlite3_column_double(stmt, 5);
    int trade_count = sqlite3_column_int(stmt, 6);

    Candle candle;
    candle.symbol = symbol;
    candle.open_time = std::chrono::time_point<std::chrono::system_clock>(
        std::chrono::milliseconds(open_time_ms));
    candle.open = open;
    candle.high = high;
    candle.low = low;
    candle.close = close;
    candle.volume = volume;

    result.push_back(candle);
  }

  sqlite3_finalize(stmt);
  return result;
}

std::vector<StoredEvent> CandleStore::query_events(const std::string& symbol,
                                                    long long start_ms, long long end_ms,
                                                    const std::vector<std::string>& event_types) {
  EventCacheKey key{symbol, start_ms, end_ms};

  // Check cache first
  {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    if (events_cache_.count(key)) {
      auto& cached = events_cache_[key];
      if (event_types.empty()) {
        return cached;  // Cache hit!
      }
      // Filter by event types
      std::vector<StoredEvent> result;
      for (const auto& event : cached) {
        for (const auto& type : event_types) {
          if (event.event_type == type) {
            result.push_back(event);
            break;
          }
        }
      }
      if (!result.empty()) return result;  // Cache hit!
    }
  }

  // Cache miss: query database
  auto result = [this, &symbol, start_ms, end_ms, &event_types]() {
    std::lock_guard<std::mutex> lock(db_mutex_);
    return db_query_events(symbol, start_ms, end_ms, event_types);
  }();

  // Cache the result
  {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    events_cache_[key] = result;
    evict_old_event_cache();
  }

  return result;
}

std::vector<StoredEvent> CandleStore::db_query_events(const std::string& symbol,
                                                     long long start_ms, long long end_ms,
                                                     const std::vector<std::string>& event_types) {
  std::string sql = R"SQL(
    SELECT event_type, timestamp_ms, symbol, source, data
    FROM events
    WHERE symbol = ? AND timestamp_ms BETWEEN ? AND ?
  )SQL";

  // Optional: filter by event types
  if (!event_types.empty()) {
    sql += " AND event_type IN (";
    for (size_t i = 0; i < event_types.size(); ++i) {
      if (i > 0) sql += ",";
      sql += "?";
    }
    sql += ")";
  }

  sql += " ORDER BY timestamp_ms ASC;";

  sqlite3_stmt* stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    throw std::runtime_error(std::string("Failed to prepare query: ") + sqlite3_errmsg(db_));
  }

  int bind_idx = 1;
  sqlite3_bind_text(stmt, bind_idx++, symbol.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int64(stmt, bind_idx++, start_ms);
  sqlite3_bind_int64(stmt, bind_idx++, end_ms);

  for (const auto& type : event_types) {
    sqlite3_bind_text(stmt, bind_idx++, type.c_str(), -1, SQLITE_STATIC);
  }

  std::vector<StoredEvent> result;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    const char* event_type_str = (const char*)sqlite3_column_text(stmt, 0);
    long long timestamp_ms = sqlite3_column_int64(stmt, 1);
    const char* symbol_str = (const char*)sqlite3_column_text(stmt, 2);
    const char* source_str = (const char*)sqlite3_column_text(stmt, 3);
    const char* data_str = (const char*)sqlite3_column_text(stmt, 4);

    StoredEvent event;
    event.event_type = event_type_str ? event_type_str : "";
    event.timestamp_ms = timestamp_ms;
    event.symbol = symbol_str ? symbol_str : "";
    event.source = source_str ? source_str : "";
    event.data = json::parse(data_str ? data_str : "{}");

    result.push_back(event);
  }

  sqlite3_finalize(stmt);
  return result;
}

void CandleStore::evict_old_candle_cache() {
  if (candles_cache_.size() > config_.max_candle_cache_entries) {
    candles_cache_.erase(candles_cache_.begin());
  }
}

void CandleStore::evict_old_event_cache() {
  if (events_cache_.size() > config_.max_event_cache_entries) {
    events_cache_.erase(events_cache_.begin());
  }
}

void CandleStore::clear_all() {
  {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    candles_cache_.clear();
    events_cache_.clear();
  }

  {
    std::lock_guard<std::mutex> lock(buffer_mutex_);
    candles_write_buffer_.clear();
    events_write_buffer_.clear();
    candles_resolution_buffer_.clear();
  }

  {
    std::lock_guard<std::mutex> lock(db_mutex_);
    exec_sql("DELETE FROM candles;");
    exec_sql("DELETE FROM events;");
  }

  std::cout << "[CandleStore] Cleared all data\n";
}

json CandleStore::get_run_meta(const std::string& symbol) const {
  // Not yet implemented; would return metadata about stored runs
  json meta;
  meta["symbol"] = symbol;
  return meta;
}

std::vector<json> CandleStore::list_runs(int limit) const {
  // Not yet implemented; would return list of recent runs
  return std::vector<json>();
}

void CandleStore::exec_sql(const std::string& sql) {
  char* err_msg = nullptr;
  int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err_msg);
  if (rc != SQLITE_OK) {
    std::string error = err_msg ? err_msg : "Unknown error";
    if (err_msg) sqlite3_free(err_msg);
    throw std::runtime_error("SQL error: " + error);
  }
}

int CandleStore::query_int(const std::string& sql, int default_value) {
  sqlite3_stmt* stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    return default_value;
  }

  int result = default_value;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    result = sqlite3_column_int(stmt, 0);
  }
  sqlite3_finalize(stmt);
  return result;
}

} // namespace eng
