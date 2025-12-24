#pragma once
#include <unordered_map>
#include <memory>
#include <stdexcept>
#include "MarketDataTypes.hpp"

namespace eng {

class InstrumentRegistry {
public:
    InstrumentRegistry() : _next_id(1) {}

    /**
     * Register or retrieve an instrument.
     * If symbol already exists, returns existing ID.
     * Otherwise, creates new Instrument with next available ID.
     */
    InstrumentId register_instrument(
        const std::string& symbol,
        AssetClass asset_class = AssetClass::Unknown,
        const std::string& exchange = "UNKNOWN",
        const std::string& currency = "USD"
    ) {
        auto it = _symbol_to_id.find(symbol);
        if (it != _symbol_to_id.end()) {
            return it->second;
        }

        InstrumentId new_id = _next_id++;
        Instrument instr;
        instr.id = new_id;
        instr.symbol = symbol;
        instr.asset_class = asset_class;
        instr.exchange = exchange;
        instr.currency = currency;

        _instruments[new_id] = instr;
        _symbol_to_id[symbol] = new_id;
        return new_id;
    }

    /**
     * Get instrument by ID.
     * Throws std::out_of_range if not found.
     */
    const Instrument& get(InstrumentId id) const {
        return _instruments.at(id);
    }

    /**
     * Get instrument by symbol.
     * Throws std::out_of_range if not found.
     */
    const Instrument& get(const std::string& symbol) const {
        InstrumentId id = _symbol_to_id.at(symbol);
        return _instruments.at(id);
    }

    /**
     * Try to get instrument by ID.
     * Returns nullptr if not found.
     */
    const Instrument* try_get(InstrumentId id) const {
        auto it = _instruments.find(id);
        return (it != _instruments.end()) ? &it->second : nullptr;
    }

    /**
     * Try to get instrument by symbol.
     * Returns nullptr if not found.
     */
    const Instrument* try_get(const std::string& symbol) const {
        auto it = _symbol_to_id.find(symbol);
        if (it == _symbol_to_id.end()) {
            return nullptr;
        }
        auto instr_it = _instruments.find(it->second);
        return (instr_it != _instruments.end()) ? &instr_it->second : nullptr;
    }

    /**
     * Lookup instrument ID by symbol.
     * Returns 0 if not found.
     */
    InstrumentId lookup_id(const std::string& symbol) const {
        auto it = _symbol_to_id.find(symbol);
        return (it != _symbol_to_id.end()) ? it->second : 0;
    }

    /**
     * Update instrument metadata.
     * Throws std::out_of_range if not found.
     */
    void set_metadata(InstrumentId id, const std::string& key, const std::string& value) {
        _instruments.at(id).metadata[key] = value;
    }

    /**
     * Clear all instruments.
     */
    void clear() {
        _instruments.clear();
        _symbol_to_id.clear();
        _next_id = 1;
    }

    /**
     * Get total number of registered instruments.
     */
    size_t size() const {
        return _instruments.size();
    }

private:
    std::unordered_map<InstrumentId, Instrument> _instruments;
    std::unordered_map<std::string, InstrumentId> _symbol_to_id;
    InstrumentId _next_id{1};
};

}
