#include "engine/IBroker.hpp"

/*
// include/brokers/InteractiveBrokers.hpp
namespace broker {
class InteractiveBrokers : public eng::IBroker {
public:
  // ctor takes creds/config
  void place_order(const Order& o) override;
  void cancel_order(const std::string& id) override;
  Account get_account() override;
  Positions list_positions() override;
};
} // broker

//*/