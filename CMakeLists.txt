cmake_minimum_required(VERSION 3.16)
project(TradingEngine VERSION 0.1 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Where to put compiled plugins
set(PLUGIN_OUTPUT_DIR ${CMAKE_BINARY_DIR}/plugins)
file(MAKE_DIRECTORY ${PLUGIN_OUTPUT_DIR})

# Include directories
include_directories(${PROJECT_SOURCE_DIR}/include)

# Add subfolders
add_subdirectory(src/engine)
add_subdirectory(src/plugins)
add_subdirectory(src/support)

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

target_link_libraries(trading_engine
	PRIVATE
		engine
		support
		pluginloader
)
