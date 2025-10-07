/*
// include/adapters/IB_MarketData.hpp (market data side for IB)
namespace adapter {
class IB_MarketData : public eng::IMarketData {
public:
  void subscribe_ticks(const std::vector<std::string>& syms,
                       std::function<void(const Tick&)> cb) override;
  // optionally override quotes/history, etc.
};
} // adapter
//*/