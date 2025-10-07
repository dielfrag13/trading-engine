#pragma once
#include <string>
#include <any>
#include <functional>
#include <unordered_map>
#include <vector>

namespace eng {

struct Event {
    std::string type;
    std::any data; 
};


class EventBus {
public:
    using Handler   = std::function<void(const Event&)>;
    using HandlerId = std::uint64_t;

    // Subscribe to a topic. Returns an id you can use to unsubscribe.
    HandlerId subscribe(const std::string& topic, Handler handler);

    // Unsubscribe; returns true if a handler was removed.
    bool unsubscribe(const std::string& topic, HandlerId id);

    // Publish an event to all handlers for its topic.
    void publish(const Event& ev) const;

private:
    std::unordered_map<std::string,
        std::vector<std::pair<HandlerId, Handler>>> handlers_;
    HandlerId next_id_{1};
};

} // namespace eng