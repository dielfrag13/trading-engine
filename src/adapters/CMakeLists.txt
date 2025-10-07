add_library(adapters
  BrokerMarketData.cpp
  # ProviderMarketData.cpp
)
target_include_directories(adapters PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(adapters PUBLIC engine support)

