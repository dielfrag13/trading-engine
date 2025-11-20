Brokers are the order execution layer.

They send orders out to the exchange and receive execution events back.

## Responsibilities

* Submit orders (market, limit, cancel, replace, etc.)

* Manage account state
    * balances
    * margin
    * positions

* Receive and emit:
    * OrderAck
    * OrderFill
    * OrderCancel
    * OrderReject

* Track open orders / statuses
* Generate broker-specific order IDs / mappings