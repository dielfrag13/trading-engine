# trading-engine
stock bot try 2

# Folder Structure
trading-engine/
├── CMakeLists.txt
├── cmake/                      # (optional) custom CMake modules
│   └── FindBroker.cmake
├── configs/
│   ├── strategies/            # per‑strategy config (e.g., JSON/TOML)
│   └── brokers/               # per‑broker config
├── include/                   # public headers
│   ├── engine/                # core engine interfaces
│   │   ├── EventBus.hpp
│   │   ├── IStrategy.hpp
│   │   └── IBroker.hpp
│   └── plugins/               # plugin loader interfaces
│       └── PluginLoader.hpp
├── src/
│   ├── engine/                # main engine implementation
│   │   ├── EventBus.cpp
│   │   └── Engine.cpp
│   ├── plugins/               # plugin‑loading glue code
│   │   └── PluginLoader.cpp
│   └── support/               # REST/WebSocket, JSON, logging, etc.
│       ├── HttpClient.cpp
│       └── WebSocketClient.cpp
├── strategies/                # compiled strategy plugins (.so/.dll)
│   └── MovingAverage/         # example plugin
│       ├── CMakeLists.txt
│       ├── MovingAverage.cpp
│       └── MovingAverage.hpp
├── brokers/                   # compiled broker plugins
│   └── Binance/               # example plugin
│       ├── CMakeLists.txt
│       ├── BinanceBroker.cpp
│       └── BinanceBroker.hpp
└── tests/                     # unit & integration tests
    ├── EngineTests.cpp
    └── PluginLoaderTests.cpp



