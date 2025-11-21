#include "brokers/NullBroker.hpp"
#include "engine/Types.hpp"
#include <iostream>

int main() {
    broker::NullBroker nb(100000.0);

    eng::Order buy;
    buy.symbol = "TEST";
    buy.qty = 10;
    buy.side = eng::Order::Side::Buy;

    std::cout << "Initial balance: " << nb.get_balance() << "\n";
    nb.place_market_order(buy);
    std::cout << "After buy balance: " << nb.get_balance() << "\n";

    eng::Order sell = buy; sell.side = eng::Order::Side::Sell;
    nb.place_limit_order(sell, 90.0); // market=100 => should execute
    std::cout << "After sell limit balance: " << nb.get_balance() << "\n";

    return 0;
}
