# Trading Engine - Documentation Guide

This file provides an overview of the repository documentation structure. Use this guide to find the information you need.

## Quick Start

**First time here?** Start with:
1. [`README.md`](./README.md) - High-level overview and key concepts
2. [`SETUP.md`](./SETUP.md) - Installation and environment setup
3. [`BUILD.md`](./BUILD.md) - Compilation and build options

## Core Documentation

### [`README.md`](./README.md)
- **Purpose:** High-level project overview
- **Contains:** What this is, key concepts, technology stack, getting started in 4 steps
- **Read if:** You need a quick understanding of the project scope
- **Audience:** Everyone

### [`SETUP.md`](./SETUP.md)
- **Purpose:** Environment setup and dependency installation
- **Contains:** System requirements, dependency installation for multiple OS, verification steps, troubleshooting
- **Read if:** You're setting up the project for the first time
- **Audience:** New developers, first-time users
- **Key Sections:**
  - One-liner install commands for each OS
  - Node.js and frontend setup
  - Verification steps with expected outputs
  - Common issues and solutions

### [`BUILD.md`](./BUILD.md)
- **Purpose:** Compilation and build configuration
- **Contains:** CMake build steps, debug/release modes, build options, parallel compilation
- **Read if:** You're building the C++ backend
- **Audience:** C++ developers, CI/CD engineers
- **Key Sections:**
  - Quick build: `./build.sh`
  - Manual CMake steps
  - Debug macros and features
  - Parallel build optimization
  - Docker considerations

### [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Purpose:** System architecture and design decisions
- **Contains:** Component responsibilities, order lifecycle, event flow, design principles
- **Read if:** You want to understand how components work together
- **Audience:** Architects, contributors, technical leads
- **Key Sections:**
  - System overview diagram
  - Component responsibilities with code examples
  - Order state machine (NEW → WORKING → FILLED/REJECTED)
  - Event flow with 8-step visual
  - Event topics and payload structures
  - Key design principles

## Module-Specific Documentation

### Backend Modules

#### [`/include/brokers/README.md`](./include/brokers/README.md)
- **Purpose:** Broker interface and implementation guide
- **Contains:** IBroker responsibilities, order lifecycle in broker context, implementation example
- **Read if:** You're implementing a real broker (Kraken, Interactive Brokers, etc.)
- **Audience:** Exchange integration developers
- **Key Sections:**
  - Full IBroker interface definition
  - NullBroker walkthrough (reference implementation)
  - Step-by-step Kraken implementation example
  - Thread safety and deployment notes
  - Testing strategies

#### [`/include/adapters/README.md`](./include/adapters/README.md)
- **Purpose:** Market data adapter interface and patterns
- **Contains:** IMarketData interface, adapter examples, error handling patterns
- **Read if:** You're connecting to market data feeds (Polygon, Kraken, file replay, etc.)
- **Audience:** Data feed integration developers
- **Key Sections:**
  - IMarketData interface definition with code
  - Examples: BrokerMarketData, WsKrakenAdapter, FileReplayAdapter
  - Data types emitted (Tick, Quote, TradePrint, Candle)
  - Error handling and recovery
  - Performance optimization tips
  - Integration with ProviderMarketData

#### [`/strategies/README.md`](./strategies/README.md)
- **Purpose:** Strategy plugin development guide
- **Contains:** IStrategy interface, plugin system, step-by-step implementation
- **Read if:** You're writing a trading strategy
- **Audience:** Quantitative developers, strategy authors
- **Key Sections:**
  - Full IStrategy interface definition
  - MovingAverage reference implementation with code walkthrough
  - Plugin system architecture
  - Step-by-step strategy implementation guide
  - CMakeLists.txt template for compilation
  - DO/DON'T list for common pitfalls
  - State management patterns
  - Testing and debugging strategies

#### [`/tests/README.md`](./tests/README.md)
- **Purpose:** Testing infrastructure and patterns
- **Contains:** Running tests, writing tests, mocking patterns
- **Read if:** You're writing or running unit tests
- **Audience:** QA engineers, backend developers
- **Key Sections:**
  - Running existing tests
  - Test files description and what they cover
  - Writing new tests with gtest examples
  - Mocking EventBus for isolated testing
  - Coverage generation and reporting
  - CI/CD integration
  - Test naming conventions
  - Code examples with best practices

#### [`/scripts/README.md`](./scripts/README.md)
- **Purpose:** Utility scripts for data capture and testing
- **Contains:** Kraken market data capture, Polygon flat file processing, WebSocket price viewer
- **Audience:** Data engineers, testing engineers

### Frontend Modules

#### [`/frontend/README.md`](./frontend/README.md)
- **Purpose:** React frontend build and development guide
- **Contains:** Vite development server, build process, component structure
- **Read if:** You're working on the React UI
- **Audience:** Frontend developers

## Documentation Organization by Task

### "I want to..."

**...set up the project for the first time**
→ [`SETUP.md`](./SETUP.md)

**...build and run the trading engine**
→ [`BUILD.md`](./BUILD.md)

**...understand how the system works**
→ [`ARCHITECTURE.md`](./ARCHITECTURE.md)

**...implement a real broker connection**
→ [`/include/brokers/README.md`](./include/brokers/README.md)

**...add a market data feed**
→ [`/include/adapters/README.md`](./include/adapters/README.md)

**...write a trading strategy**
→ [`/strategies/README.md`](./strategies/README.md)

**...write unit tests**
→ [`/tests/README.md`](./tests/README.md)

**...modify the React frontend**
→ [`/frontend/README.md`](./frontend/README.md)

**...extract market data**
→ [`/scripts/README.md`](./scripts/README.md)

## Key Concepts Reference

### Order Lifecycle
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) "Order Lifecycle" section for visual state machine.

States: `NEW` → `WORKING` → (`FILLED` | `PARTIALLY_FILLED` | `REJECTED` | `CANCELED`)

### Event-Driven Architecture
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) "Event Architecture" section.

All components communicate through EventBus pub/sub, not direct function calls.

### Plugin System
See [`/strategies/README.md`](./strategies/README.md) "Plugin System" section.

Strategies and brokers are compiled as `.so` (Linux) or `.dll` (Windows) files and loaded at runtime.

### WebSocket Bridge
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) "System Overview" section.

FrontendBridge relays engine events to web clients, connected frontend updates via hooks.

## Document Index

| File | Lines | Purpose | Audience |
|------|-------|---------|----------|
| [`README.md`](./README.md) | ~300 | Project overview | Everyone |
| [`SETUP.md`](./SETUP.md) | ~400 | Environment setup | New users |
| [`BUILD.md`](./BUILD.md) | ~200 | Build process | C++ developers |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | ~400 | System design | Architects |
| [`/include/brokers/README.md`](./include/brokers/README.md) | ~500 | Broker integration | Exchange integrators |
| [`/include/adapters/README.md`](./include/adapters/README.md) | ~500 | Data feeds | Data feed integrators |
| [`/strategies/README.md`](./strategies/README.md) | ~1300 | Strategy development | Quant developers |
| [`/tests/README.md`](./tests/README.md) | ~300 | Testing patterns | QA/developers |
| [`/scripts/README.md`](./scripts/README.md) | ~100 | Data utilities | Data engineers |
| [`/frontend/README.md`](./frontend/README.md) | ~100 | Frontend build | Frontend developers |

## Contributing to Documentation

When adding new features:
1. Update relevant module README first
2. Add event flow diagrams if adding new events
3. Update [`ARCHITECTURE.md`](./ARCHITECTURE.md) for architectural changes
4. Update [`SETUP.md`](./SETUP.md) for new dependencies
5. Update [`BUILD.md`](./BUILD.md) for build system changes
6. Update main [`README.md`](./README.md) for major feature announcements

## Documentation Status

✅ **Complete:**
- System architecture and design decisions
- Core build and setup processes
- Plugin system (strategies, brokers, adapters)
- Event-driven order system

🔄 **In Progress:**
- Frontend component examples
- Advanced strategy patterns
- Performance tuning guides

📝 **Planned:**
- Backtesting framework documentation
- Real broker integration examples (Kraken, IB)
- Kubernetes deployment guide
- Performance benchmarks

---

**Last Updated:** December 2024
**Version:** 2.0 (Complete reorganization with specialized READMEs)
