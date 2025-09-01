add_library(support
	  HttpClient.cpp
	    WebSocketClient.cpp
	    )
    target_include_directories(support PUBLIC ${PROJECT_SOURCE_DIR}/include)
