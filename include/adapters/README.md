Adapters are market data ingestors. 

They connect to external data sources, subscribe to market data streams, parse and normalize raw exchange messages, and emit:
* ticks
* quotes
* TradePrints
* Candles

They are never responsible for:

* Sending orders
* Knowing account balances
* Executing trades
* Handling fills
* Risk checks
* Position updates

This layer is *write-only into the system*. Never out. 

