#pragma once
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <zlib.h>
#include <nlohmann/json.hpp>
#include "../engine/IMarketData.hpp"
#include "../engine/InstrumentRegistry.hpp"

namespace adapter {

/**
 * KrakenFileReplayAdapter
 *
 * Replays Kraken trade history from JSONL.GZ files.
 * Reads trades_*.jsonl.gz or YYYY-MM-DD.jsonl.gz format,
 * maps Kraken fields to generic TradePrint events.
 *
 * Kraken trade format (per line):
 * {
 *   "pair": "BTCUSD",
 *   "price": 43500.5,
 *   "volume": 0.123,
 *   "time": 1234567890.123,
 *   "side": "buy" | "sell",
 *   "ordertype": "market" | "limit",
 *   "misc": "m" (maker) | "M" (missing maker), ...
 * }
 */
class KrakenFileReplayAdapter : public eng::IMarketData {
public:
    using json = nlohmann::json;

    /**
     * Create adapter with reference to shared InstrumentRegistry.
     * The registry's lifetime must exceed this adapter's.
     */
    explicit KrakenFileReplayAdapter(std::shared_ptr<eng::InstrumentRegistry> registry)
        : _registry(registry), _is_running(false), _filepath("") {}

    /**
     * Create adapter with filepath (for backtest mode).
     * The registry's lifetime must exceed this adapter's.
     */
    explicit KrakenFileReplayAdapter(
        const std::string& filepath,
        std::shared_ptr<eng::InstrumentRegistry> registry
    )
        : _registry(registry), _is_running(false), _filepath(filepath) {}

    ~KrakenFileReplayAdapter() {
        stop();
    }

    // ---- Lifecycle ----

    void start() override {
        _is_running = true;
    }

    void stop() override {
        _is_running = false;
    }

    // ---- Subscription (not used in backtest mode, but required by interface) ----

    void subscribe_ticks(
        const std::string& symbol,
        std::function<void(const eng::Tick&)> callback
    ) override {
        // Not used in file replay; ticks are emitted on demand via replay()
    }

    void subscribe_trades(
        const std::string& symbol,
        std::function<void(const eng::TradePrint&)> callback
    ) override {
        _trade_callbacks[symbol] = callback;
    }

    void subscribe_quotes(
        const std::string& symbol,
        std::function<void(const eng::Quote&)> callback
    ) override {
        // Kraken doesn't provide quotes in trade files
    }

    // Vector-based subscribe methods (for interface compliance)
    void subscribe_ticks(
        const std::vector<std::string>& symbols,
        std::function<void(const eng::Tick&)> callback
    ) override {
        // Not used in file replay
    }

    void subscribe_quotes(
        const std::vector<std::string>& symbols,
        std::function<void(const eng::Quote&)> callback
    ) override {
        // Kraken doesn't provide quotes in trade files
    }

    void subscribe_trades(
        const std::vector<std::string>& symbols,
        std::function<void(const eng::TradePrint&)> callback
    ) override {
        // Store callback for all symbols (simplified for backtest)
        for (const auto& symbol : symbols) {
            _trade_callbacks[symbol] = callback;
        }
    }

    // Candle queries (not used in backtest, but required by interface)
    std::vector<eng::Candle> get_hist_candles(
        const std::string& symbol,
        const std::string& interval,
        int limit
    ) override {
        return {};
    }

    // ---- Backtest API ----

    /**
     * Replay trades from a Kraken JSONL.GZ file.
     * 
     * @param filepath Path to trades_*.jsonl.gz or YYYY-MM-DD.jsonl.gz
     * @param pace Replay speed: 1.0 = real-time, 10.0 = 10x, 0.0 = instant
     * @param on_trade Optional callback for each replayed trade
     * @return Number of trades replayed
     */
    size_t replay(
        const std::string& filepath,
        double pace = 1.0,
        std::function<void(const eng::TradePrint&)> on_trade = nullptr
    ) {
        if (!_is_running) {
            throw std::runtime_error("Adapter not started; call start() first");
        }

        size_t trade_count = 0;
        std::vector<json> trades;

        try {
            // Read and decompress JSONL.GZ
            trades = read_jsonl_gz(filepath);
        } catch (const std::exception& e) {
            throw std::runtime_error(
                "Failed to read Kraken file '" + filepath + "': " + std::string(e.what())
            );
        }

        // Replay each trade
        for (const auto& trade_json : trades) {
            try {
                eng::TradePrint tp = parse_kraken_trade(trade_json);
                
                // Emit via callback if subscribed
                auto it = _trade_callbacks.find(tp.symbol);
                if (it != _trade_callbacks.end()) {
                    it->second(tp);
                }

                // Emit via on_trade if provided
                if (on_trade) {
                    on_trade(tp);
                }

                trade_count++;
            } catch (const std::exception& e) {
                // Skip malformed trades
                // In production, might want to log warning
            }
        }

        return trade_count;
    }

    // ---- Instrument Registry Access ----

    std::shared_ptr<eng::InstrumentRegistry> get_registry() const {
        return _registry;
    }

private:
    std::shared_ptr<eng::InstrumentRegistry> _registry;
    bool _is_running;
    std::string _filepath;
    std::unordered_map<std::string, std::function<void(const eng::TradePrint&)>> _trade_callbacks;

    /**
     * Read and decompress JSONL.GZ file.
     * Returns vector of JSON objects (one per line).
     */
    std::vector<json> read_jsonl_gz(const std::string& filepath) const {
        std::vector<json> result;

        gzFile file = gzopen(filepath.c_str(), "rb");
        if (!file) {
            throw std::runtime_error("Cannot open gzip file: " + filepath);
        }

        try {
            char buffer[4096];
            std::string line_buffer;

            while (true) {
                int bytes_read = gzread(file, buffer, sizeof(buffer));
                if (bytes_read < 0) {
                    throw std::runtime_error("Error reading gzip file");
                }
                if (bytes_read == 0) {
                    break; // EOF
                }

                line_buffer.append(buffer, bytes_read);

                // Process complete lines
                size_t pos = 0;
                while ((pos = line_buffer.find('\n')) != std::string::npos) {
                    std::string line = line_buffer.substr(0, pos);
                    if (!line.empty() && line.back() == '\r') {
                        line.pop_back();
                    }

                    if (!line.empty()) {
                        try {
                            result.push_back(json::parse(line));
                        } catch (const json::exception& e) {
                            // Skip malformed JSON lines
                        }
                    }

                    line_buffer.erase(0, pos + 1);
                }
            }

            // Process remaining line (if file doesn't end with \n)
            if (!line_buffer.empty()) {
                try {
                    result.push_back(json::parse(line_buffer));
                } catch (const json::exception& e) {
                    // Skip malformed JSON
                }
            }

        } catch (...) {
            gzclose(file);
            throw;
        }

        gzclose(file);
        return result;
    }

    /**
     * Parse a Kraken trade JSON object into generic TradePrint.
     * 
     * Kraken format (per trade):
     * {
     *   "pair": "BTCUSD",
     *   "price": 43500.5,
     *   "volume": 0.123,
     *   "time": 1234567890.123,  // Unix timestamp with fractional seconds
     *   "side": "buy" or "sell",
     *   "ordertype": "market" or "limit",
     *   "misc": "m" (maker) | "M" (missing maker) | etc.
     * }
     */
    eng::TradePrint parse_kraken_trade(const json& j) const {
        eng::TradePrint tp;

        // Extract symbol from "pair" field
        std::string pair = j.at("pair").get<std::string>();
        tp.symbol = pair;

        // Register/lookup instrument
        eng::InstrumentId instr_id = _registry->lookup_id(pair);
        if (instr_id == 0) {
            // Register new instrument as Crypto from Kraken exchange
            instr_id = _registry->register_instrument(
                pair,
                eng::AssetClass::Crypto,
                "KRAKEN",
                "USD"
            );
        }
        tp.instrument_id = instr_id;

        // Extract price, volume, timestamp
        tp.price = j.at("price").get<double>();
        tp.qty = j.at("volume").get<double>();

        // Convert Unix timestamp (seconds.fractional) to TimePoint
        double unix_timestamp = j.at("time").get<double>();
        auto seconds = static_cast<long>(unix_timestamp);
        auto micros = static_cast<long>((unix_timestamp - seconds) * 1e6);
        tp.ts = eng::TimePoint(std::chrono::duration_cast<std::chrono::system_clock::duration>(
            std::chrono::seconds(seconds) + std::chrono::microseconds(micros)
        ));

        // Parse side: "buy" or "sell"
        std::string side_str = j.at("side").get<std::string>();
        if (side_str == "buy") {
            tp.side = eng::TradeSide::Buy;
        } else if (side_str == "sell") {
            tp.side = eng::TradeSide::Sell;
        } else {
            tp.side = eng::TradeSide::Unknown;
        }

        // Parse ordertype: "market" or "limit"
        std::string ordertype_str = j.at("ordertype").get<std::string>();
        if (ordertype_str == "market") {
            tp.order_type = eng::OrderType::Market;
        } else if (ordertype_str == "limit") {
            tp.order_type = eng::OrderType::Limit;
        } else {
            tp.order_type = eng::OrderType::Unknown;
        }

        // Parse misc field for liquidity: "m" = maker, others = taker/unknown
        std::string misc_str = j.at("misc").get<std::string>();
        if (misc_str.find('m') != std::string::npos) {
            tp.liquidity = eng::TradeLiquidity::Maker;
        } else {
            tp.liquidity = eng::TradeLiquidity::Taker;
        }

        // Store original Kraken misc in metadata for debugging
        tp.metadata["kraken_misc"] = misc_str;

        return tp;
    }
};

}
