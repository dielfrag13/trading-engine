#pragma once
#include <string>
#include <chrono>
#include <cstdint>
#include <unordered_map>

namespace eng {

using TimePoint = std::chrono::time_point<std::chrono::system_clock>;
using InstrumentId = std::uint64_t;
using MetaMap = std::unordered_map<std::string, std::string>;

// ---- Enums for generic, venue-agnostic trade classification ----

enum class TradeSide {
    Buy,
    Sell,
    Unknown,
};

enum class OrderType {
    Market,
    Limit,
    Unknown,
};

enum class TradeLiquidity {
    Maker,
    Taker,
    Unknown,
};

enum class AssetClass {
    Equity,
    Future,
    Option,
    Fx,
    Crypto,
    Unknown,
};

// ---- Instrument definition (venue-agnostic) ----

struct Instrument {
    InstrumentId id{0};
    std::string  symbol;           // e.g. "AAPL", "ESZ5", "BTCUSD"
    AssetClass   asset_class{AssetClass::Unknown};
    std::string  exchange;         // e.g. "NYSE", "CME", "KRAKEN"
    std::string  currency{"USD"};

    // Optional, per-asset-class fields:
    double       multiplier{1.0};  // futures/options contract multiplier
    std::string  underlying{};     // for options, futures on indexes
    double       strike{0.0};      // options only
    // Date expiry{};              // TODO: add Date type if needed
    
    MetaMap      metadata;         // venue-specific extras (debugging)
};

// ---- Price/trade tick types ----

struct Tick {
    std::string symbol;
    double last{0.0};
    TimePoint ts{};
};

struct Quote {
    std::string symbol;
    double bid{0.0};
    double ask{0.0};
    TimePoint ts{};
};

struct TradePrint {
    InstrumentId   instrument_id{0};
    std::string    symbol;         // convenience, also in registry lookup
    double         price{0.0};
    double         qty{0.0};
    TimePoint      ts{};

    // Generic venue-agnostic classification
    TradeSide      side{TradeSide::Unknown};
    OrderType      order_type{OrderType::Unknown};
    TradeLiquidity liquidity{TradeLiquidity::Unknown};

    // Optional, for debugging / venue-specific flags
    MetaMap        metadata;
};

struct Candle {
    std::string symbol;
    TimePoint   open_time{};
    double      open{0.0};
    double      high{0.0};
    double      low{0.0};
    double      close{0.0};
    double      volume{0.0};
};

}
