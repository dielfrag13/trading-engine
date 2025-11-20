# trading-engine
stock bot try 2

# Folder Structure
- **trading-engine/**
  - `CMakeLists.txt`
  - **cmake/** _(optional custom CMake modules)_
    - `FindBroker.cmake`
  - **configs/**
    - **strategies/** _(per‑strategy config, e.g. JSON/TOML)_
    - **brokers/** _(per‑broker config)_
  - **include/** _(public headers)_
    - **engine/**
      - `EventBus.hpp`
      - `IStrategy.hpp`
      - `IBroker.hpp`
    - **plugins/**
      - `PluginLoader.hpp`
  - **src/**
    - **engine/** _(main engine implementation)_
      - `EventBus.cpp`
      - `Engine.cpp`
    - **plugins/** _(plugin‑loading glue)_
      - `PluginLoader.cpp`
    - **support/** _(REST/WebSocket, JSON, logging, etc.)_
      - `HttpClient.cpp`
      - `WebSocketClient.cpp`
  - **strategies/** _(compiled strategy plugins, .so/.dll)_
    - **MovingAverage/** _(example plugin)_
      - `CMakeLists.txt`
      - `MovingAverage.cpp`
      - `MovingAverage.hpp`
  - **brokers/** _(compiled broker plugins)_
    - **Binance/** _(example plugin)_
      - `CMakeLists.txt`
      - `BinanceBroker.cpp`
      - `BinanceBroker.hpp`
  - **tests/** _(unit & integration tests)_
    - `EngineTests.cpp`
    - `PluginLoaderTests.cpp`

# required packages
```
sudo apt-get update
sudo apt-get install -y \
    build-essential        \  # g++, make, etc.
    cmake                  \  # CMake + ctest
    ninja-build            \  # optional faster builds
    libboost-all-dev       \  # Boost libraries (Asio, filesystem, etc.)
    nlohmann-json3-dev     \  # JSON parsing
    libspdlog-dev          \  # Logging
    libcurl4-openssl-dev   \  # REST client (cURL)
    libwebsocketpp-dev     \  # WebSocket++
    libssl-dev             \  # TLS support
    pkg-config             \  # helps CMake find libs
    clang                  \  # if you wanna try Clang
    clang-format           \  # for code linting
    gdb                    \  # debugger
    valgrind               \  # memory checking
```

```
sudo apt-get update && apt-get install -y build-essential cmake ninja-build libboost-all-dev libspdlog-dev nlohmann-json-dev libcurl4-openssl-dev libwebsocketpp-dev libssl-dev pkg-config
```

# To build the project:
```
# from your project root
mkdir -p build && cd build

# configure
cmake .. -DCMAKE_BUILD_TYPE=Release

# build everything (engine libs, pluginloader, support, and any in-tree plugins)
cmake --build .

# (optional) run tests
ctest --output-on-failure

```


High-level ASCII representation

```mermaid
flowchart LR
  %% ===========
  %% External World
  %% ===========
  subgraph EXCHANGES["External World (Exchanges / Data Sources)"]
    WS1["WebSocket Feeds<br/>(e.g., Kraken, Binance)"]
    REST1["REST APIs<br/>(hist candles, metadata)"]
    FILES["CSV / Parquet Files<br/>(backtest data)"]
  end

  %% ===========
  %% Adapters (Market Data In)
  %% ===========
  subgraph ADAPTERS["Market Data Adapters"]
    IMarketData[/"IMarketData<br/>(interface)"/]

    BrokerMD["BrokerMarketData<br/>(demo / backtest)"]
    FileReplay["FileReplayAdapter"]
    WsKraken["WsKrakenAdapter"]
  end

  WS1 --> WsKraken
  REST1 --> BrokerMD
  FILES --> FileReplay

  IMarketData --- BrokerMD
  IMarketData --- FileReplay
  IMarketData --- WsKraken

  %% ===========
  %% Engine Core
  %% ===========
  subgraph ENGINE["Engine Core"]
    EventBus["EventBus<br/>(pub/sub)"]
    ProviderMD["ProviderMarketData<br/>(aggregator / normalizer)"]
    CoreEngine["Engine<br/>(orchestrator, lifecycle)"]
  end

  %% Provider consumes adapters
  BrokerMD --> ProviderMD
  FileReplay --> ProviderMD
  WsKraken --> ProviderMD

  %% Provider to EventBus (option A or B)
  ProviderMD --> EventBus

  %% ===========
  %% Strategies
  %% ===========
  subgraph STRATS["Strategies"]
    IStrategy[/"IStrategy<br/>(interface)"/]
    NullStrat["NullStrategy<br/>(example)"]
    OtherStrat["CustomStrategy plugins"]
  end

  IStrategy --- NullStrat
  IStrategy --- OtherStrat

  %% Strategies subscribe to bus topics (ticks, candles, fills)
  EventBus --> STRATS

  %% Strategies emit intents / orders to broker
  STRATS --> CoreEngine

  %% ===========
  %% Brokers (Execution)
  %% ===========
  subgraph BROKERS["Brokers (Order Execution)"]
    IBroker[/"IBroker<br/>(interface)"/]
    NullBroker["NullBroker<br/>(stub)"]
    RealBroker["RealBroker<br/>(exchange impls)"]
  end

  IBroker --- NullBroker
  IBroker --- RealBroker

  CoreEngine --> BROKERS

  %% Broker sends execution events (fills, rejects, account updates) back to bus
  BROKERS --> EventBus

  %% ===========
  %% Plugin System
  %% ===========
  subgraph PLUGINS["Plugin System"]
    PluginLoader["PluginLoader<br/>(dlopen / dlsym)"]
    SharedLibs[".so / .dll<br/>strategy & broker plugins"]
  end

  SharedLibs --> PluginLoader
  PluginLoader --> STRATS
  PluginLoader --> BROKERS

  %% ===========
  %% Notes
  %% ===========
  classDef iface fill:#ffffff,stroke:#333,stroke-dasharray: 3 3;
  class IMarketData,IStrategy,IBroker iface;

```
