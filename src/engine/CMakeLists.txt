add_library(engine
    EventBus.cpp
    Engine.cpp
    CandleStore.cpp
)
target_include_directories(engine PUBLIC ${PROJECT_SOURCE_DIR}/include)
target_link_libraries(engine PUBLIC support)  # if you have a support lib

# Link SQLite3
target_link_libraries(engine PUBLIC sqlite3)



