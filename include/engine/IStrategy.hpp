#pragma once

class IStrategy {
public:
    virtual void on_price_tick(const /* PriceData& */) = 0;
    virtual /* TradeAction */ get_trade_action() = 0;
    virtual void on_order_fill(const /* Order& */) = 0;
    virtual ~IStrategy() = default;
};
