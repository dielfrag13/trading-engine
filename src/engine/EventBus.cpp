// EventBus.cpp

#include "engine/EventBus.hpp"

namespace eng {

EventBus::HandlerId EventBus::subscribe(const std::string& topic, Handler handler) {
    const HandlerId id = next_id_++;
    handlers_[topic].emplace_back(id, std::move(handler));
    return id;
}


bool EventBus::unsubscribe(const std::string& topic, HandlerId id) {
    auto it = handlers_.find(topic);
    if (it == handlers_.end()) return false;
    auto& vec = it->second;
    for (auto vit = vec.begin(); vit != vec.end(); ++vit) {
        if (vit->first == id) { vec.erase(vit); return true; }
    }
    return false;
}

void EventBus::publish(const Event& ev) const {
    auto it = handlers_.find(ev.type);
    if (it == handlers_.end()) return;
    for (auto& pair : it->second) {
        pair.second(ev); // invoke handler
    }
}

}