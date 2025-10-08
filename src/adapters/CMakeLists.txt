add_library(adapters
  BrokerMarketData.cpp
  # other sources...
)
target_include_directories(adapters PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(adapters 
  PUBLIC 
    engine 
    support
    Threads::Threads        # sets both compile and link flags correctly accross platforms
                            # don't use -lpthread, as that's a linux-only thing
)

