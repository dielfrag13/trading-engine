# Building the Trading Engine

## Quick Start

```bash
# Build with debug symbols and debug macros enabled
./build.sh

# Build optimized release binary
./build.sh release
```

## Manual Build Steps

```bash
mkdir -p build && cd build

# Configure (Debug mode)
cmake .. -DCMAKE_BUILD_TYPE=Debug

# Or Release mode
cmake .. -DCMAKE_BUILD_TYPE=Release

# Build with parallel jobs (uses all CPU cores)
cmake --build . -- -j$(nproc)

# Run tests (optional)
ctest --output-on-failure
```

## Build Modes

### Debug Mode (Default)
- Includes debug symbols (`-g`)
- Enables `#ifdef ENG_DEBUG` macros for verbose logging
- Slower execution, easier debugging
- **Use for development**

```bash
./build.sh
# or
cmake .. -DCMAKE_BUILD_TYPE=Debug
```

### Release Mode
- Compiler optimizations (`-O3`)
- No debug symbols
- Disables `ENG_DEBUG` macros
- Faster execution, smaller binary
- **Use for production/performance testing**

```bash
./build.sh release
# or
cmake .. -DCMAKE_BUILD_TYPE=Release
```

## Using Debug Macros

Add verbose output in your code:

```cpp
#ifdef ENG_DEBUG
  std::cout << "debug is on! let's go\n";
#endif
```

These blocks are compiled out in Release mode, so zero performance penalty.

## Build System Details

- **CMake**: Cross-platform build configuration
- **Parallel build**: Automatic use of all CPU cores with `nproc`
- **Incremental**: Only rebuilds changed files
- **Out-of-tree**: Build artifacts go to `build/` directory, source stays clean

## Troubleshooting

### Clean Rebuild
```bash
rm -rf build && ./build.sh
```

### Check Dependencies
```bash
pkg-config --list-all | grep -E "boost|nlohmann|websocketpp"
```

### Verbose Build Output
```bash
cd build && cmake --build . -- VERBOSE=1
```

## Continuous Integration

The same `./build.sh` script can be used in CI/CD pipelines:

```bash
#!/bin/bash
set -e
./build.sh release
cd build
ctest --output-on-failure
```
