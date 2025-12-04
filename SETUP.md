# Setting Up the Development Environment

## System Requirements

- **OS**: Linux (tested on Ubuntu 20.04+), macOS, or Windows with WSL2
- **CPU**: Any modern processor (parallel build uses all cores)
- **RAM**: 2GB minimum (4GB+ recommended for development)
- **Disk**: 5GB for dependencies + build artifacts

## Backend (C++) Dependencies

### Package Manager Installation (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y \
    build-essential        \  # g++, make, libc-dev
    cmake                  \  # CMake build system
    ninja-build            \  # Optional: faster builds than make
    libboost-all-dev       \  # Boost libraries (Asio, filesystem, etc.)
    nlohmann-json3-dev     \  # JSON parsing (nlohmann/json)
    libspdlog-dev          \  # Structured logging
    libcurl4-openssl-dev   \  # REST client (HTTP)
    libwebsocketpp-dev     \  # WebSocket++ server library
    libssl-dev             \  # OpenSSL for TLS
    pkg-config             \  # Dependency discovery for CMake
    gdb                    \  # Debugger
    valgrind               \  # Memory profiler (optional)
```

Or one-liner:
```bash
sudo apt-get update && sudo apt-get install -y build-essential cmake ninja-build libboost-all-dev nlohmann-json3-dev libspdlog-dev libcurl4-openssl-dev libwebsocketpp-dev libssl-dev pkg-config gdb valgrind
```

### macOS (Homebrew)

```bash
brew install cmake boost nlohmann-json spdlog curl websocketpp openssl pkg-config
```

## Frontend (Node.js) Dependencies

### Node.js Installation

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install nodejs -y

# macOS
brew install node
```

Verify:
```bash
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 8.0.0
```

### Frontend Package Installation

```bash
cd frontend

# React + TypeScript + Vite
npm install

# UI Component Library
npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion

# Charts
npm install recharts

# State Management
npm install zustand

# WebSocket Client
npm install isomorphic-ws

# Optional: Routing
npm install react-router-dom

# Development Tools
npm install --save-dev prettier
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

## Verification

After installation, verify everything works:

```bash
# Backend
mkdir -p build && cd build && cmake .. && make && ctest

# Frontend
cd frontend && npm run build
```

## Optional Development Tools

### Code Formatting
```bash
# C++
sudo apt install clang-format

# TypeScript/JavaScript
cd frontend && npm install --save-dev prettier
```

### Debugging Tools

```bash
# Memory profiling
sudo apt install valgrind

# Debugger
sudo apt install gdb

# Use gdb with the binary
gdb ./build/trading_engine
```

## Environment Variables

No special environment variables required, but you can customize:

```bash
# C++: Use Release optimizations for performance testing
export CMAKE_BUILD_TYPE=Release

# Node: Use production mode to disable development warnings
export NODE_ENV=production
```

## Docker (Optional)

For reproducible environments:

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    build-essential cmake ninja-build \
    libboost-all-dev nlohmann-json3-dev \
    libspdlog-dev libcurl4-openssl-dev \
    libwebsocketpp-dev libssl-dev pkg-config \
    curl nodejs npm

WORKDIR /trading-engine
COPY . .

RUN ./build.sh release
WORKDIR /trading-engine/frontend
RUN npm install && npm run build
```

Build and run:
```bash
docker build -t trading-engine .
docker run -it trading-engine
```

## Troubleshooting

### Missing nlohmann/json headers
```bash
# Ensure the package is installed
dpkg -l | grep nlohmann
# Or install directly
sudo apt install nlohmann-json3-dev
```

### WebSocket++ not found
```bash
# Install or check location
sudo apt install libwebsocketpp-dev
pkg-config --cflags websocketpp
```

### Node modules issues
```bash
# Clean install
cd frontend
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. See [BUILD.md](BUILD.md) for compilation instructions
2. See [ARCHITECTURE.md](ARCHITECTURE.md) for system design
3. See [frontend/README.md](frontend/README.md) for UI development
