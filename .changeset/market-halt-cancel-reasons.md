---
"@polyester/sdk": patch
---

Order and trigger `cancelReason` add `market_halted`: the exchange halted the market and canceled every open order and trigger of it, attached take-profit and stop-loss included, and released their reserved funds. Fills before the cancel stand, and the market refuses new orders until it trades again. Show it as "market halted", not as a user cancel.
