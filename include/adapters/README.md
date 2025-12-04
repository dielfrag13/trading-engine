Adapters are market data ingestors. 

They connect to external data sources, subscribe to market data streams, parse and normalize raw exchange messages, and emit standardized events.

## Responsibilities

**Adapters are data INPUT only**. They:
* Connect to external data sources (exchanges, files, APIs)
* Parse and normalize raw messages into standard types
* Emit market data events (ticks, quotes, trades, candles)
* Handle connection lifecycle (connect, reconnect, disconnect)

**Adapters NEVER**:
* Send orders or interact with accounts
* Know about strategies or brokers
* Make trading decisions
* Update positions or balances
* Publish order events

This isolation ensures adapters can be swapped without affecting other components.

## Data Types Emitted

### Tick (Price Update)
```cpp
struct Tick {
    std::string symbol;        // "BTCUSD", "SPY", etc.
    double last;              // Last trade price
    std::chrono::system_clock::time_point ts;  // When this tick occurred
};
```

### Quote (Bid/Ask)
```cpp
struct Quote {
    std::string symbol;
    double bid;
    double ask;
    double bid_size;
    double ask_size;
    std::chrono::system_clock::time_point ts;
};
```

### TradePrint (Trade Execution Detail)
```cpp
struct TradePrint {
    std::string symbol;
    double price;
    double qty;
    bool is_buy;  // Buyer vs seller initiated
    std::chrono::system_clock::time_point ts;
};
```

### Candle (OHLCV Bar)
```cpp
struct Candle {
    std::string symbol;
    double open;
    double high;
    double low;
    double close;
    double volume;
    std::string interval;  // "1m", "5m", "1h", "1d", etc.
    std::chrono::system_clock::time_point ts;
};
```

## Interface (IMarketData)

```cpp
class IMarketData {
public:
    // Subscribe to new ticks and receive updates via callback
    virtual void subscribe_ticks(const std::vector<std::string>& symbols,
                                std::function<void(const Tick&)> on_tick) = 0;

    // Subscribe to quotes (bid/ask updates)
    virtual void subscribe_quotes(const std::vector<std::string>& symbols,
                                 std::function<void(const Quote&)> on_quote) = 0;

    // Subscribe to raw trade prints
    virtual void subscribe_trades(const std::vector<std::string>& symbols,
                                 std::function<void(const TradePrint&)> on_trade) = 0;

    // Query historical candle data
    virtual std::vector<Candle> get_hist_candles(const std::string& symbol,
                                                const std::string& interval,
                                                int limit) = 0;

    virtual ~IMarketData() = default;
};
```

## Examples

### BrokerMarketData (Demo/Backtest)
Generates synthetic ticks for testing. Located in `src/adapters/BrokerMarketData.cpp`.

```cpp
class BrokerMarketData : public IMarketData {
public:
    explicit BrokerMarketData(IBroker& broker);

    void subscribe_ticks(const std::vector<std::string>& symbols,
                        std::function<void(const Tick&)> on_tick) override;
    
    void start(int seconds);  // Run for N seconds, emitting synthetic ticks

private:
    IBroker& broker_;
    // ... synthetic price generation
};
```

### WebSocket Adapter (Kraken, Binance, etc.)
Connects to exchange WebSocket feed:

```cpp
class WsKrakenAdapter : public IMarketData {
public:
    explicit WsKrakenAdapter(const std::string& ws_url);

    void subscribe_ticks(...) override {
        // Register callback
        // WebSocket messages will trigger on_tick()
    }

    void connect();

private:
    std::unique_ptr<WebSocketClient> ws_;
    
    void on_ws_message(const std::string& json) {
        // Parse Kraken trade message
        auto tick = parse_trade(json);
        for (auto& handler : tick_handlers_) {
            handler(tick);
        }
    }
};
```

### File Replay Adapter (Backtesting)
Replays historical data from files:

```cpp
class FileReplayAdapter : public IMarketData {
public:
    explicit FileReplayAdapter(const std::string& filepath);

    void subscribe_ticks(...) override;
    void start(bool fast_forward = false);  // Replay at speed

private:
    std::ifstream file_;
    std::thread replay_thread_;
};
```

## Implementation Checklist

When implementing a new adapter:

1. **Inherit from IMarketData**
```cpp
class MyAdapter : public eng::IMarketData {
public:
    explicit MyAdapter(...);
    // ... implement virtual methods
};
```

2. **Connect to data source**
```cpp
void MyAdapter::connect() {
    // WebSocket, REST polling, file reading, etc.
    ws_.connect("wss://api.exchange.com/feed");
}
```

3. **Parse and normalize messages**
```cpp
void MyAdapter::on_message(const std::string& raw_json) {
    // Parse exchange-specific format
    auto json = nlohmann::json::parse(raw_json);
    
    // Normalize to Tick
    Tick tick{
        json["symbol"],
        json["price"],
        std::chrono::system_clock::now()
    };
    
    // Emit to all subscribers
    for (auto& handler : tick_handlers_) {
        handler(tick);
    }
}
```

4. **Handle subscriptions**
```cpp
void MyAdapter::subscribe_ticks(const std::vector<std::string>& symbols,
                               std::function<void(const Tick&)> on_tick) {
    tick_handlers_.push_back(on_tick);
    
    // Tell exchange which symbols to send
    for (const auto& sym : symbols) {
        ws_.send({{"type", "subscribe"}, {"symbol", sym}});
    }
}
```

5. **Manage lifecycle**
```cpp
~MyAdapter() override {
    // Cleanup: close WebSocket, flush buffers, etc.
    if (ws_.is_open()) {
        ws_.close();
    }
}
```

## Error Handling

Adapters should handle:
- Connection failures (retry, backoff)
- Network timeouts
- Malformed messages (log and skip)
- Out-of-order messages (buffer/sort if needed)

```cpp
void on_ws_message(const std::string& raw) {
    try {
        auto json = nlohmann::json::parse(raw);
        auto tick = parse_trade(json);
        emit_tick(tick);
    } catch (const std::exception& e) {
        std::cerr << "[Adapter] Failed to parse: " << e.what() << "\n";
        // Continue processing other messages
    }
}
```

## Testing Adapters

Unit test example:

```cpp
TEST(BrokerMarketDataTest, EmitTicksOnSubscription) {
    NullBroker broker;
    BrokerMarketData adapter(broker);

    std::vector<Tick> received_ticks;
    adapter.subscribe_ticks({"BTCUSD"}, [&](const Tick& t) {
        received_ticks.push_back(t);
    });

    adapter.start(1);  // Run for 1 second

    EXPECT_GT(received_ticks.size(), 0);
    EXPECT_EQ(received_ticks[0].symbol, "BTCUSD");
}
```

## Performance Considerations

- **Latency**: Minimize time between data arrival and callback execution
- **Memory**: Don't buffer excessive tick history (ProviderMarketData handles aggregation)
- **Threading**: Use worker threads for I/O (WebSocket, file reading), avoid blocking engine thread
- **Backpressure**: Handle slow subscribers (consider queuing or dropping old ticks)

## Integration with ProviderMarketData

Adapters are attached to a `ProviderMarketData` aggregator:

```cpp
auto provider = std::make_unique<eng::ProviderMarketData>();

auto adapter1 = std::make_unique<WsKrakenAdapter>("wss://...");
auto adapter2 = std::make_unique<FileReplayAdapter>("backtest.csv");

provider->attach(std::move(adapter1));
provider->attach(std::move(adapter2));

// Provider normalizes and aggregates all ticks to single EventBus
provider->subscribe_ticks({"BTCUSD"}, [](const Tick& t) {
    // Ticks from all adapters arrive here
});
```

## See Also
* [ARCHITECTURE.md](../../ARCHITECTURE.md) — Adapter's role in data flow
* [engine/IMarketData.hpp](../engine/IMarketData.hpp) — Interface definition
