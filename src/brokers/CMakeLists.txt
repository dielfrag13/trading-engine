add_library(brokers
  NullBroker.cpp
)

target_include_directories(brokers PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(brokers
  PUBLIC
    engine
    support
    Threads::Threads
)

if(TARGET pluginloader)
  # If pluginloader exists, let it know about brokers (optional)
  target_link_libraries(pluginloader PUBLIC brokers)
endif()

# Small test executable to exercise the NullBroker in-tree
add_executable(test_nullbroker
  test_nullbroker.cpp
)
target_link_libraries(test_nullbroker
  PRIVATE
    brokers
    Threads::Threads
)
target_include_directories(test_nullbroker PRIVATE ${PROJECT_SOURCE_DIR}/include)
