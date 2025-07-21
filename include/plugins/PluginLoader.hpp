#pragma once
#include <string>
#include <memory>

class PluginLoader {
public:
    template<typename T>
    std::unique_ptr<T> load(const std::string& path);
};
