---
"@polyester/sdk": patch
---

Sync the public protobuf contract to `e37f87c5694f0199119f92899afa2b51d5be141d`.

- Order and trigger `cancelReason` add `market_halted`. When the exchange halts a market it cancels every open order and trigger of that market, attached take-profit and stop-loss included, and releases their reserved funds. Fills before the cancel stand, and the market refuses new orders until it trades again. Show it as "market halted", not as a user cancel.
