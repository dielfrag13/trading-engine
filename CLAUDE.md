# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Build the C++ backend:**
```bash
./build.sh          # Debug build (default, ENG_DEBUG macros enabled)
./build.sh release  # Release build (optimized, debug symbols stripped)
```
Outputs binary at `build/trading_engine`. Uses all CPU cores via CMake.

**Run tests:**
```bash
cd build && ctest --output-on-failure
ctest -R EngineTests --output-on-failure  # run a specific test suite
```

**Start the backend:**
```bash
./build/trading_engine --data-file <path> [--symbol BTCUSD]
# WebSocket server starts on port 8080
```

**Start the frontend:**
```bash
cd frontend && npm install && npm run dev
# Vite dev server at http://localhost:5173, connects to ws://localhost:8080
```

**Frontend lint/typecheck:**
```bash
cd frontend && npm run lint
```

## Architecture

This is an event-driven C++ trading engine with a React frontend. See `ARCHITECTURE.md` for full diagrams. The core data flow:

```
Market Data Adapters → ProviderMarketData → EventBus → Strategies
                                                     ↓
                                               Engine (orchestrator)
                                                     ↓
                                               Broker (execution)
                                                     ↓
                                               EventBus → FrontendBridge → React (WebSocket)
```

**EventBus** (`include/engine/EventBus.hpp`) is the central pub/sub hub. Every component communicates exclusively through it — strategies don't call brokers, brokers don't call the frontend. Type-safe via `std::any`/`std::any_cast`.

**Key event topics:** `ProviderTick`, `OrderPlaced`, `OrderFilled`, `OrderRejected`.

**Engine** (`include/engine/Engine.hpp`) subscribes to `ProviderTick`, forwards to strategy, polls for `TradeAction`, then calls `broker.place_limit_order()`.

**FrontendBridge** (`src/server/FrontendBridge.cpp`) subscribes to all EventBus topics and broadcasts JSON over WebSocket to the frontend. Also handles RPC queries (`QueryCandles`, `QueryOrders`, `QueryPositions`, `QueryDefaultViewport`).

**CandleStore** persists candles to SQLite3 for historical chart queries.

## Extension Points

All three core interfaces are plugin points — loaded as `.so`/`.dll` via `PluginLoader`:

- **IStrategy** (`include/engine/IStrategy.hpp`): implement `on_price_tick()`, `get_trade_action()`, `on_order_fill()`. See `MovingAverage` as reference.
- **IBroker** (`include/engine/IBroker.hpp`): implement order execution, balance tracking, position management, emit lifecycle events to EventBus. See `NullBroker` as reference.
- **IMarketData** (`include/engine/IMarketData.hpp`): ingest external feeds, emit `ProviderTick` events. See `KrakenFileReplayAdapter` or `BrokerMarketData` as reference.

Plugin factory convention:
```cpp
extern "C" {
    eng::IStrategy* create_strategy() { return new MyStrategy(); }
}
```

## Order Lifecycle

```
NEW → (broker assigns ID, publishes OrderPlaced) → WORKING
    → (execution check passes) → FILLED / PARTIALLY_FILLED
    → (validation fails) → REJECTED
```

`OrderPlaced` is published *before* the execution check — the frontend sees all order attempts in real time.

## Frontend

React 19 + TypeScript + Zustand + Recharts + Chakra UI, built with Vite.

- **`frontend/src/api/engineWS.ts`** — singleton WebSocket client
- **`frontend/src/hooks/useEngineConnection.ts`** — connection lifecycle, routes incoming messages to Zustand stores
- **`frontend/src/store/`** — `orderStore`, `tickStore`, `chartStore`, `eventStore`

Frontend calculates P&L and weighted average cost basis locally from fill events; the backend does not push pre-computed P&L.

## Key Design Rules (from ARCHITECTURE.md)

1. All state changes flow through EventBus — never call across component boundaries directly.
2. Broker assigns order IDs (not the strategy or engine).
3. `OrderPlaced` is published before execution check so the frontend has immediate visibility.
4. Market data adapters are write-only into the system — they never read orders or account state.
5. Strategies are decoupled from symbol, exchange, and broker details.

## Debug Builds

`#ifdef ENG_DEBUG` blocks are compiled in by `./build.sh` (debug mode) and stripped by `./build.sh release`. Use debug builds during development for extra logging and assertions.
