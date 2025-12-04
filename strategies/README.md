# Strategy Plugins

Every strategy is compiled as a `.so` (Linux) or `.dll` (Windows) plugin that can be loaded at runtime without recompiling the engine.

## Architecture

Strategies are **decoupled from infrastructure**. A single strategy works with:
- Any symbol (BTCUSD, SPY, etc.)
- Any broker (Kraken, Binance, paper trading)
- Any market data source (live, backtest, replay)

The engine handles data routing, so strategies only care about price analysis and trade decisions.

## Plugin Structure

Each strategy directory follows this layout:

```
strategies/
├── MovingAverage/
│   ├── CMakeLists.txt
│   ├── MovingAverage.hpp
│   └── MovingAverage.cpp
├── RSI/
│   ├── CMakeLists.txt
│   ├── RSI.hpp
│   └── RSI.cpp
└── README.md
```

## Implementing a Strategy

### 1. Inherit from IStrategy

```cpp
// include/strategies/MyStrategy.hpp
#pragma once
#include "engine/IStrategy.hpp"

namespace strategy {

class MyStrategy : public eng::IStrategy {
public:
    explicit MyStrategy(const std::string& symbol);

    // Called on each market tick
    void on_price_tick(const eng::PriceData& pd) override;

    // Called by engine to get current trade decision
    eng::TradeAction get_trade_action() override;

    // Called when an order fills
    void on_order_fill(const eng::Order& order) override;

private:
    std::string symbol_;
    eng::TradeAction action_{eng::TradeAction::None};
    // ... strategy state (indicators, buffers, etc.)
};

}
```

### 2. Implement Core Methods

```cpp
// src/strategies/MyStrategy.cpp
#include "strategies/MyStrategy.hpp"

namespace strategy {

MyStrategy::MyStrategy(const std::string& symbol)
    : symbol_(symbol) {}

void MyStrategy::on_price_tick(const eng::PriceData& pd) {
    // Filter to our symbol
    if (pd.symbol != symbol_) return;

    // Analyze price
    double signal = analyze(pd.last);

    // Generate trade decision
    if (signal > 0.5) {
        action_ = eng::TradeAction::Buy;
    } else if (signal < -0.5) {
        action_ = eng::TradeAction::Sell;
    } else {
        action_ = eng::TradeAction::None;
    }
}

eng::TradeAction MyStrategy::get_trade_action() {
    auto result = action_;
    // Note: Do NOT reset action_ here. The engine calls this,
    // executes orders, then calls on_order_fill() which can reset.
    return result;
}

void MyStrategy::on_order_fill(const eng::Order& order) {
    // Update position tracking
    if (order.side == eng::Order::Side::Buy) {
        total_bought_qty_ += order.filled_qty;
    } else {
        total_sold_qty_ += order.filled_qty;
    }

    // Reset action after fill
    action_ = eng::TradeAction::None;
}

}
```

### 3. Create CMakeLists.txt

```cmake
# strategies/MyStrategy/CMakeLists.txt

add_library(MyStrategyPlugin SHARED
    MyStrategy.cpp
    MyStrategy.hpp
)

target_include_directories(MyStrategyPlugin PRIVATE
    ${PROJECT_SOURCE_DIR}/include
)

set_target_properties(MyStrategyPlugin PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${PLUGIN_OUTPUT_DIR}
    PREFIX ""                             # No 'lib' prefix
    SUFFIX ".so"                          # Or .dll on Windows
)
```

## Example: MovingAverage Strategy

```cpp
class MovingAverageStrategy : public eng::IStrategy {
public:
    MovingAverageStrategy(std::string symbol, size_t window = 5, 
                         double threshold = 0.5, double qty = 0.01)
        : symbol_(symbol), window_(window), threshold_(threshold), qty_(qty) {}

    void on_price_tick(const eng::PriceData& pd) override {
        if (pd.symbol != symbol_) return;

        // Keep rolling window of prices
        prices_.push_back(pd.last);
        if (prices_.size() > window_) prices_.pop_front();

        // Calculate SMA
        double sum = 0.0;
        for (double p : prices_) sum += p;
        double sma = sum / static_cast<double>(prices_.size());

        // Generate signal
        if (pd.last > sma + threshold_) {
            action_ = eng::TradeAction::Buy;
        } else if (pd.last < sma - threshold_) {
            action_ = eng::TradeAction::Sell;
        } else {
            action_ = eng::TradeAction::None;
        }
    }

    eng::TradeAction get_trade_action() override {
        return action_;
    }

    void on_order_fill(const eng::Order& order) override {
        if (order.side == eng::Order::Side::Buy) {
            total_bought_qty_ += order.filled_qty;
        } else {
            total_sold_qty_ += order.filled_qty;
        }
        action_ = eng::TradeAction::None;
    }

private:
    std::deque<double> prices_;
    double threshold_;
    // ... more state
};
```

## Strategy Lifecycle

```
1. Engine loads strategy plugin at startup
2. For each market tick:
   a. Engine calls strategy->on_price_tick(tick)
   b. Strategy analyzes price, updates internal state
   c. Engine calls strategy->get_trade_action()
   d. Engine receives BUY, SELL, or NONE
   e. If BUY/SELL, engine calls broker->place_limit_order()
   f. Broker publishes OrderFilled or OrderRejected event
3. When order fills:
   a. Engine calls strategy->on_order_fill(order)
   b. Strategy updates position tracking, resets action
```

## State Management

Strategies maintain state between ticks:
- **Price buffers**: Rolling window for indicators (SMA, EMA, RSI)
- **Position tracking**: Total bought/sold, current position, P&L
- **Signal state**: Last indicator value, crossover flags
- **Configuration**: Parameters (window size, threshold, etc.)

Example:
```cpp
private:
    std::deque<double> prices_;              // Last N prices
    double last_sma_{0.0};
    double last_price_{0.0};
    double total_bought_qty_{0.0};
    double total_sold_qty_{0.0};
    eng::TradeAction action_{eng::TradeAction::None};
```

## Important Constraints

### DO NOT
- Send orders directly (strategies return decisions, engine executes)
- Access broker account state (only what strategy tracks locally)
- Publish to EventBus directly (engine handles integration)
- Assume any specific symbol (strategies are symbol-agnostic)
- Maintain dependencies on market data source

### DO
- Keep state minimal and self-contained
- Reset action_ after fills (in on_order_fill)
- Filter by symbol in on_price_tick
- Use simple data structures (deques, vectors)
- Log analysis results for debugging

## Testing Strategies

Unit test example:

```cpp
TEST(MovingAverageTest, GenerateBuySignal) {
    MovingAverageStrategy strat("BTCUSD", 5, 1.0, 0.01);

    // Feed some prices
    strat.on_price_tick({100.0});  // symbol = "BTCUSD"
    strat.on_price_tick({100.0});
    strat.on_price_tick({100.0});
    strat.on_price_tick({100.0});
    strat.on_price_tick({100.0});  // SMA = 100

    // Price spikes above SMA + threshold
    strat.on_price_tick({101.5});

    EXPECT_EQ(strat.get_trade_action(), eng::TradeAction::Buy);
}
```

## Compilation

Build all strategy plugins:
```bash
./build.sh         # Compiles all .so plugins to build/plugins/
./build.sh release # Release optimizations
```

Plugins go to: `build/plugins/`

## Loading at Runtime

The engine uses `PluginLoader` to dynamically load strategies:

```cpp
auto strat = PluginLoader::load<eng::IStrategy>(
    "./build/plugins/libMovingAveragePlugin.so"
);
```

See [include/plugins/PluginLoader.hpp](../include/plugins/PluginLoader.hpp) for details.

## Best Practices

1. **Stateless computation**: Pure functions for calculations (SMA, RSI, etc.)
2. **Clear signal generation**: Document what conditions trigger BUY/SELL
3. **Bounds checking**: Validate price buffers have enough data before analysis
4. **Resource cleanup**: Destructor handles any cleanup (file handles, connections)
5. **Logging**: Use `#ifdef ENG_DEBUG` for verbose analysis output

Example:
```cpp
void on_price_tick(const eng::PriceData& pd) {
    if (pd.symbol != symbol_) return;
    
    prices_.push_back(pd.last);
    if (prices_.size() > window_) prices_.pop_front();

    // Require minimum buffer before analyzing
    if (prices_.size() < window_) {
        action_ = eng::TradeAction::None;
        return;
    }

    // Now analyze
    double sma = calculate_sma();
    // ...
}
```

## Plugin System Notes

- **Hot reload**: Stop engine, rebuild strategy, restart (no need to rebuild engine)
- **API compatibility**: Strategies must match `IStrategy` interface version
- **Error handling**: Exceptions in strategies are caught by engine, logged, and continue
- **Performance**: Strategies run on engine's event loop (don't block)

## See Also
* [ARCHITECTURE.md](../ARCHITECTURE.md) — Strategy's role in the event loop
* [include/engine/IStrategy.hpp](../include/engine/IStrategy.hpp) — Interface definition
 





