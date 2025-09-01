// EventBus.cpp

#include "engine/EventBus.hpp"

void EventBus::subscribe(const std::string& eventType, Handler handler) {
    handlers[eventType].push_back(std::move(handler));
}

void EventBus::publish(const Event& ev) {
    auto it = handlers.find(ev.type);
    if (it != handlers.end()) {
        for (auto& h : it->second) {
            h(ev);
        }
    }
}