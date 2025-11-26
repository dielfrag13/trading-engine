add_library(server STATIC
  FrontendBridge.cpp
)

target_include_directories(server PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(server
  PUBLIC
    engine
)
