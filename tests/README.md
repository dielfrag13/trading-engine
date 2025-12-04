# Tests

Unit tests and integration tests for the C++ trading engine.

## Running Tests

```bash
# Build with tests
./build.sh

# Run all tests
cd build
ctest --output-on-failure

# Run specific test
ctest -R EngineTests --output-on-failure

# Run with verbose output
ctest --output-on-failure -V
```

## Test Files

### EngineTests.cpp
Integration tests for the Engine, EventBus, and core flow:
- EventBus pub/sub
- Engine tick routing to strategy
- Strategy decision polling
- Order execution flow

### PluginLoaderTests.cpp
Plugin system tests:
- Loading strategy plugins
- Loading broker plugins
- Interface compatibility checking

### NullBrokerTests (src/brokers/test_nullbroker.cpp)
Unit tests for the NullBroker reference implementation:
- Order execution logic
- Balance tracking
- Position management
- Order event publishing

## Writing Tests

Use Google Test (gtest) framework:

```cpp
#include <gtest/gtest.h>
#include "engine/Engine.hpp"
#include "brokers/NullBroker.hpp"

TEST(BrokerTests, AcceptLimitOrderAndPublishOrderPlaced) {
    eng::EventBus bus;
    broker::NullBroker broker(bus, 1000.0);  // $1000 initial balance

    // Track published events
    std::vector<std::string> events;
    bus.subscribe("OrderPlaced", [&](const eng::Event& ev) {
        events.push_back(ev.type);
    });

    // Submit a buy order
    eng::Order order;
    order.symbol = "BTC";
    order.qty = 0.01;
    order.side = eng::Order::Side::Buy;

    double filled = broker.place_limit_order(order, 50000.0);

    // Verify event was published
    EXPECT_EQ(events.size(), 1);
    EXPECT_EQ(events[0], "OrderPlaced");
}

TEST(StrategyTests, MovingAverageBuySignal) {
    strategy::MovingAverageStrategy strat("BTCUSD", 5, 1.0, 0.01);

    // Feed prices at 100
    for (int i = 0; i < 5; i++) {
        strat.on_price_tick(eng::PriceData{"BTCUSD", 100.0});
    }

    // Price spikes above SMA + threshold (100 + 1.0)
    strat.on_price_tick(eng::PriceData{"BTCUSD", 101.5});

    EXPECT_EQ(strat.get_trade_action(), eng::TradeAction::Buy);
}
```

## Test Structure

```cpp
class MyTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Initialize test fixtures
    }

    void TearDown() override {
        // Cleanup
    }

    // Test members
};

TEST_F(MyTest, SomeTest) {
    // test code
}
```

## Mocking EventBus

For isolated unit tests, mock the EventBus:

```cpp
class MockEventBus : public eng::EventBus {
public:
    MOCK_METHOD(HandlerId, subscribe, (const std::string&, Handler), (override));
    MOCK_METHOD(void, publish, (const Event&), (const, override));
    // ...
};
```

## Coverage

Generate coverage reports (optional):

```bash
cd build
cmake .. -DCMAKE_CXX_FLAGS="--coverage"
make
ctest
# Generate HTML report
gcovr --html-details coverage.html
```

## Continuous Integration

Tests should pass before committing:

```bash
#!/bin/bash
set -e

./build.sh release
cd build
ctest --output-on-failure

echo "All tests passed!"
```

## Test Naming Conventions

- `ClassName_MethodName_ExpectedBehavior`
- `OrderPlaced_WithInsufficientBalance_RejectOrder`
- `MovingAverage_PriceAboveThreshold_ReturnBuy`

## See Also
* [ARCHITECTURE.md](../ARCHITECTURE.md) — System architecture
* [BUILD.md](../BUILD.md) — Build system
