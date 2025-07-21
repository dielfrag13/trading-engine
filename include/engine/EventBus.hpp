#pragma once
#include <string>
#include <any>
#include <functional>
#include <unordered_map>
#include <vector>

struct Event {
    std::string type;
    std::any    payload;
};

class EventBus {
public:
    using Handler = std::function<void(const Event&)>;
    void subscribe(const std::string& eventType, Handler handler);
    void publish(const Event& ev);
private:
    std::unordered_map<std::string, std::vector<Handler>> handlers;
};
