---
"@polyester/sdk": patch
---

Decode the `SELF_TRADE_PREVENTION` trigger cancel reason as `cancelReason: "self_trade_prevention"` instead of `"unspecified"`. Triggers report it when self-trade prevention canceled their child orders.
