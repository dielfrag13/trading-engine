#pragma once
#include <string>
#include <functional>

class WebSocketClient {
public:
    // Connect to a WebSocket endpoint
    void connect(const std::string& uri);
    // Register a message callback
    void on_message(std::function<void(const std::string&)> cb);
    // TODO: add send(), close(), error handling, etc.
};
