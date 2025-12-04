# trading-engine
A C++-based multicomponent trading engine with real-time React frontend and event-driven architecture.

## Quick Links

- **[SETUP.md](SETUP.md)** — Environment setup and dependency installation
- **[BUILD.md](BUILD.md)** — Build instructions and compilation modes
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System design, component responsibilities, and event flow
- **[frontend/README.md](frontend/README.md)** — Frontend tech stack and development
- **[strategies/README.md](strategies/README.md)** — Writing trading strategy plugins
- **[include/brokers/README.md](include/brokers/README.md)** — Broker interface and order execution

## What This Is

A production-grade trading system architecture combining:

- **C++ Engine** — High-performance order execution, strategy orchestration, market data aggregation
- **Event-Driven Core** — Pub/sub EventBus decouples all components (strategies, brokers, frontend)
- **React Frontend** — Real-time dashboard with live price charts, order history, position tracking
- **WebSocket Bridge** — Engine publishes events (ticks, fills, rejections) to frontend in real-time
- **Plugin System** — Load trading strategies and broker integrations as `.so`/`.dll` libraries

## Key Concepts

### Order Lifecycle
Every order flows through event-driven states:
```
NEW → WORKING (broker accepted) → FILLED/REJECTED
```

Each state transition publishes an event that reaches the frontend in real-time.

### Event-Driven Architecture
The **EventBus** is the central hub. All components publish and subscribe to topics:
- `ProviderTick` — Market data
- `OrderPlaced` — Order submitted
- `OrderFilled` — Order executed
- `OrderRejected` — Order failed validation

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed event flows.

### Decoupled Components
- **Strategies** don't know about brokers or symbols
- **Brokers** don't know about strategies or frontend
- **Frontend** is pure consumer of events (can't fail the engine)

This allows swapping implementations without recompilation.

## Getting Started

### 1. Setup Environment
```bash
# Install dependencies (C++, Node.js, libraries)
# See SETUP.md for detailed instructions
```

### 2. Build Backend
```bash
./build.sh              # Debug mode
./build.sh release      # Production mode
```

See [BUILD.md](BUILD.md) for detailed build options.

### 3. Build Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Run
```bash
# Terminal 1: Start the C++ engine
./build/trading_engine

# Terminal 2: Start the React frontend
cd frontend && npm run dev
```

Then open `http://localhost:5173` in your browser.

## Folder Structure

```
trading-engine/
├── include/              # C++ headers (interfaces and types)
│   ├── engine/          # Core engine interfaces (IStrategy, IBroker, EventBus)
│   ├── adapters/        # Market data adapter interface
│   ├── brokers/         # Broker interface
│   └── strategies/      # Strategy interface
├── src/                 # C++ implementation
│   ├── engine/          # EventBus, Engine orchestrator
│   ├── brokers/         # NullBroker (demo), future real brokers
│   ├── adapters/        # BrokerMarketData (demo)
│   ├── strategies/      # MovingAverage (example strategy)
│   ├── server/          # FrontendBridge (WebSocket relay)
│   └── plugins/         # Plugin loader
├── frontend/            # React + TypeScript frontend
│   ├── src/
│   │   ├── components/  # UI components (charts, panels)
│   │   ├── hooks/       # React hooks (useEngineConnection, etc.)
│   │   ├── store/       # Zustand state (orders, positions, ticks)
│   │   ├── api/         # WebSocket client (engineWS)
│   │   └── App.tsx      # Root component
│   └── package.json
├── tests/               # C++ unit/integration tests
├── scripts/             # Python utilities (Kraken data capture, etc.)
├── CMakeLists.txt       # C++ build configuration
└── build.sh             # Build script
```

## Key Files to Understand

### Backend
- `include/engine/Types.hpp` — Order struct with lifecycle (NEW, WORKING, FILLED, REJECTED)
- `include/engine/EventBus.hpp` — Pub/sub event hub
- `include/engine/IBroker.hpp` — Broker interface
- `src/brokers/NullBroker.cpp` — Example broker (publishes OrderPlaced, OrderFilled, OrderRejected)
- `src/server/FrontendBridge.cpp` — WebSocket relay to frontend

### Frontend
- `frontend/src/api/engineWS.ts` — WebSocket client and message types
- `frontend/src/store/orderStore.ts` — Zustand order + position state
- `frontend/src/hooks/useEngineConnection.ts` — WebSocket event handler
- `frontend/src/components/PriceChart.tsx` — Live price chart
- `frontend/src/components/OrdersPanel.tsx` — Order history

## Example Flow

```
1. Engine starts, loads strategy (MovingAverage)
2. Market data adapter publishes ProviderTick events to EventBus
3. Engine subscribes to ProviderTick, forwards to strategy
4. Strategy analyzes price, returns TradeAction::Buy
5. Engine calls broker.place_limit_order()
6. Broker assigns order ID, publishes OrderPlaced event
7. Broker checks execution, publishes OrderFilled event
8. FrontendBridge relays OrderFilled as JSON to WebSocket
9. Frontend useEngineConnection hook receives, updates Zustand store
10. React components render updated orders/positions in real-time
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed event diagrams.

## Technology Stack

### Backend (C++17)
- **Boost.Asio** — Async I/O, networking
- **nlohmann/json** — JSON serialization
- **WebSocket++** — WebSocket server
- **CMake** — Cross-platform build

### Frontend (TypeScript)
- **React 18** — UI framework
- **Vite** — Lightning-fast dev server and bundler
- **Chakra UI** — Modern component library
- **Recharts** — Data visualization
- **Zustand** — Lightweight state management
- **WebSocket** — Real-time browser API

## Testing

### Unit Tests (C++)
```bash
cd build
ctest --output-on-failure
```

### Frontend
```bash
cd frontend
npm test
npm run lint
```

## Development Tips

- **Debug logs**: Add `#ifdef ENG_DEBUG` macros for verbose output
- **Hot reload**: Vite auto-refreshes on code changes
- **Dark mode**: Toggle in frontend (UI preference stored in Zustand)
- **WebSocket debugging**: Open browser DevTools → Network → WS

## Future Enhancements

- [ ] Real broker integrations (Kraken, Binance, etc.)
- [ ] Multi-strategy portfolio management
- [ ] Risk controls (position limits, stop-losses)
- [ ] Backtesting framework with historical data replay
- [ ] Dashboard persistence (save layouts, watchlists)
- [ ] Live P&L and performance analytics

## Architecture Resources

For deeper understanding:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Full component breakdown and event flows
- **[SETUP.md](SETUP.md)** — Dependency installation
- **[BUILD.md](BUILD.md)** — Compilation options
- **[strategies/README.md](strategies/README.md)** — Writing plugins
- **[frontend/README.md](frontend/README.md)** — Frontend development

## License

See LICENSE file.
 



notes:
Created frontend scaffolding with:
```
npm create vite@latest frontend -- --template react-ts
```

