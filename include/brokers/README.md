Brokers are the order execution layer.

They accept orders from the engine, validate them against account state, execute them (market/limit), and emit lifecycle events back to the EventBus.

## Responsibilities

### Order Handling
* Accept orders from Engine (`place_market_order`, `place_limit_order`)
* Assign unique order IDs
* Check execution eligibility (sufficient balance, valid parameters)
* Execute orders (match against market, update positions)
* Publish order lifecycle events

### Account Management
* Track account balance (cash)
* Maintain position tracking (qty per symbol, average cost basis)
* Calculate margin and buying power
* Enforce position limits (future enhancement)

### Event Publishing
Brokers publish events to the EventBus:
* **OrderPlaced** — Order accepted and queued (status=WORKING)
* **OrderFilled** — Order executed, position updated (status=FILLED or PARTIALLY_FILLED)
* **OrderRejected** — Order validation failed (status=REJECTED)

### Order Tracking
* Generate broker-specific order IDs
* Track open orders and their statuses
* Record fills with execution price and quantity
* Store rejection reasons for failed orders

## Order Lifecycle

```
NEW (created by strategy/engine)
  ↓
place_limit_order() called
  ↓
WORKING (order ID assigned, event published)
  ↓
Broker checks execution logic:
  ├─ If executable → FILLED (event published, position updated)
  ├─ If insufficient balance → REJECTED (event published)
  └─ If no position to sell → REJECTED (event published)
```

## Interface (IBroker)

```cpp
class IBroker {
public:
    // Submit an order (delegates to market or limit based on type)
    virtual void place_order(const Order& order) = 0;

    // Market order: execute immediately at current market price
    // Returns filled quantity (0.0 if not executed)
    virtual double place_market_order(const Order& order) {
        return 0.0;  // default: not implemented
    }

    // Limit order: execute only at specified limit_price or better
    // Returns filled quantity (0.0 if not executed)
    virtual double place_limit_order(const Order& order, double limit_price) {
        return 0.0;  // default: not implemented
    }

    // Account queries
    virtual double get_balance() = 0;
    virtual PriceData get_current_price(const std::string& symbol) = 0;

    virtual ~IBroker() = default;
};
```

## Example: NullBroker

`NullBroker` is a reference implementation for testing and demos:

* Accepts EventBus reference for event publishing
* Maintains fake account balance and positions
* Executes limit orders deterministically (price must match or beat limit)
* Publishes OrderPlaced immediately on submission
* Publishes OrderFilled or OrderRejected based on execution logic
* Tracks positions and average fill prices

**Key behavior**:
```cpp
// Buy: deduct from balance, add to position
position[symbol] += qty;
balance -= qty * price;

// Sell: add to balance, reduce position (or reject if no position)
if (position[symbol] <= 0) return REJECTED;
balance += qty * price;
position[symbol] = 0;
```

## Implementing a Real Broker

To implement a real broker (Kraken, Binance, etc.):

1. **Inherit from IBroker**
```cpp
class KrakenBroker : public eng::IBroker {
public:
    explicit KrakenBroker(eng::EventBus& bus, const std::string& api_key, const std::string& api_secret);
    // ... implement virtual methods
};
```

2. **Constructor accepts EventBus**
```cpp
KrakenBroker::KrakenBroker(eng::EventBus& bus, ...)
    : bus_(&bus), api_key_(api_key), api_secret_(api_secret) {}
```

3. **Implement place_limit_order()**
```cpp
double KrakenBroker::place_limit_order(const Order& order, double limit_price) {
    // 1. Validate order (check balance, position limits, etc.)
    if (!validate_order(order)) {
        order.status = OrderStatus::REJECTED;
        publish_event("OrderRejected", order);
        return 0.0;
    }

    // 2. Assign order ID
    uint64_t order_id = generate_order_id();
    
    // 3. Publish OrderPlaced
    order.id = order_id;
    order.status = OrderStatus::WORKING;
    publish_event("OrderPlaced", order);

    // 4. Submit to exchange (REST API call)
    auto response = http_client_.post(
        "/api/orders",
        {{"symbol", order.symbol},
         {"qty", order.qty},
         {"limit_price", limit_price},
         {"side", order.side == Order::Side::Buy ? "BUY" : "SELL"}}
    );

    // 5. Check execution
    if (response.status == ExecutionStatus::FILLED) {
        order.status = OrderStatus::FILLED;
        order.filled_qty = order.qty;
        order.fill_price = limit_price;
        update_position(order);
        publish_event("OrderFilled", order);
        return order.qty;
    } else if (response.status == ExecutionStatus::REJECTED) {
        order.status = OrderStatus::REJECTED;
        order.rejection_reason = response.error_message;
        publish_event("OrderRejected", order);
        return 0.0;
    } else {
        // Order queued but not yet filled (typical for limit orders)
        return 0.0;  // Return 0 for unfilled orders
    }
}
```

4. **Implement account queries**
```cpp
double KrakenBroker::get_balance() {
    auto response = http_client_.get("/api/account");
    return response.cash;
}

eng::PriceData KrakenBroker::get_current_price(const std::string& symbol) {
    auto response = http_client_.get("/api/ticker?symbol=" + symbol);
    return {symbol, response.last_price};
}
```

5. **Handle async fills (optional)**
```cpp
// For real brokers, fills may arrive asynchronously (e.g., from WebSocket)
void KrakenBroker::on_order_fill_notification(const ExchangeFill& fill) {
    Order order = lookup_order(fill.order_id);
    order.status = OrderStatus::FILLED;
    order.filled_qty = fill.qty;
    order.fill_price = fill.price;
    update_position(order);
    publish_event("OrderFilled", order);
}
```

## Deployment Notes

* **Thread safety**: Brokers may be called from multiple threads. Use locks when updating state.
* **Timeout handling**: Real brokers should have network timeouts and retry logic.
* **Account sync**: Periodically sync account state with exchange to detect fills outside the engine.
* **Risk controls**: Consider implementing position limits, max order size, circuit breakers.

## Testing

```cpp
// Unit test example
TEST(KrakenBrokerTest, RejectBuyOrderWithInsufficientBalance) {
    KrakenBroker broker(mock_bus, "key", "secret");
    broker.balance_ = 100.0;  // Only $100
    
    Order order;
    order.symbol = "BTC";
    order.qty = 1.0;  // Want to buy 1 BTC
    order.side = Order::Side::Buy;
    
    // Attempt to buy BTC at $50k (would need $50k, but only have $100)
    double filled = broker.place_limit_order(order, 50000.0);
    
    EXPECT_EQ(filled, 0.0);
    EXPECT_EQ(order.status, OrderStatus::REJECTED);
    EXPECT_EQ(order.rejection_reason, "Insufficient balance");
}
```

## See Also
* [ARCHITECTURE.md](../../ARCHITECTURE.md) — Order lifecycle and event flow
* [Engine](../engine/IBroker.hpp) — IBroker interface definition
