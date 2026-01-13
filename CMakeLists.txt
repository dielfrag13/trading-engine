cmake_minimum_required(VERSION 3.16)
project(TradingEngine VERSION 0.1 LANGUAGES CXX)

# (Optional) sensible default if none provided
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Choose the build type." FORCE)
  set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "RelWithDebInfo" "MinSizeRel")
endif()

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Where to put compiled plugins
set(PLUGIN_OUTPUT_DIR ${CMAKE_BINARY_DIR}/plugins)
file(MAKE_DIRECTORY ${PLUGIN_OUTPUT_DIR})

# --- interface target to carry config-specific macros/flags ---
add_library(eng_build_config INTERFACE)
# Define ENG_DEBUG only for Debug configuration (works for single- and multi-config)
target_compile_definitions(eng_build_config INTERFACE
  $<$<CONFIG:Debug>:ENG_DEBUG>
)


# (Optional) tweak warnings/opts per config (inherit by everything that links this)
target_compile_options(eng_build_config INTERFACE
  $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall -Wextra -Wpedantic>
  $<$<AND:$<CONFIG:Release>,$<CXX_COMPILER_ID:GNU,Clang>>:-O2>
  $<$<AND:$<CONFIG:Debug>,$<CXX_COMPILER_ID:GNU,Clang>>:-O0 -g>
)


# Include directories
include_directories(${PROJECT_SOURCE_DIR}/include)

# Prefer pthread and import the Threads target -- a requirement for linux, apparently.
# chatgpt: Yup — that error means you're using std::thread but not linking pthreads. On Linux, std::thread needs pthread_create from libpthread.
set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)

# zlib for gzip decompression (used by KrakenFileReplayAdapter)
find_package(ZLIB REQUIRED)

# SQLite3 for persistent candle/event storage
find_package(SQLite3 REQUIRED)

# WebSocket++ (header-only, but needs asio)
find_package(websocketpp QUIET)
if(NOT websocketpp_FOUND)
  # If websocketpp is not installed, try to find asio instead
  # websocketpp is header-only and just needs asio/boost.asio
  message(STATUS "websocketpp not found via find_package, will rely on system headers if available")
  # For Ubuntu: apt install libwebsocketpp-dev
  # We'll include it from /usr/include/websocketpp if available
endif()

# Add subfolders
add_subdirectory(src/engine)
add_subdirectory(src/plugins)
add_subdirectory(src/support)
add_subdirectory(src/adapters)
add_subdirectory(src/brokers)
add_subdirectory(src/strategies)
add_subdirectory(src/server)

# Strategy & Broker plugins (optional: only if you want to build them here)
# add_subdirectory(strategies/MovingAverage)
# add_subdirectory(brokers/Binance)

# Enable testing
enable_testing()
# add_subdirectory(tests)


# compile main.cpp into a binary called trading_engine & link against libraries we built
add_executable(trading_engine
	src/main.cpp
)

# Link everything + the config interface so macros/flags propagate
target_link_libraries(trading_engine
	PRIVATE
		engine
		support
		pluginloader
		adapters
		strategies_lib
		server
		Threads::Threads		# sets flags accordingly accross platforms. Don't hardcode -lpthread, that's a linux thing. 
		ZLIB::ZLIB			# for gzip decompression in KrakenFileReplayAdapter
		eng_build_config
)

# Also ensure the libs themselves see ENG_DEBUG when compiled in Debug
target_link_libraries(engine      PUBLIC eng_build_config)
target_link_libraries(support     PUBLIC eng_build_config)
target_link_libraries(pluginloader PUBLIC eng_build_config)
target_link_libraries(adapters    PUBLIC eng_build_config)

# Why an INTERFACE target? It’s a neat way to attach compile definitions/options once 
# and propagate them to every target that links it. 
# The generator expression $<$<CONFIG:Debug>:ENG_DEBUG> defines ENG_DEBUG only for Debug builds, 
# both on single-config (-DCMAKE_BUILD_TYPE=Debug) and multi-config (--config Debug) generators.