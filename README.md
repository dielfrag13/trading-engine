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

