add_library(strategies_lib
  MovingAverage.cpp
)

target_include_directories(strategies_lib PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(strategies_lib
  PUBLIC
    engine
)

# Do not force plugin output for now; strategies are built into the binary as a convenience.
