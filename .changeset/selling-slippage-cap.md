---
"@polyester/sdk": patch
---

Reject a 10000 bps max slippage on a market order or trailing stop that sells, which the backend rejects with `MAX_SLIPPAGE_INVALID`. Sell market orders, the attached trailing stop of a buy order, and standalone trailing-stop triggers, including `triggers.modify`, now accept 1 through 9999 bps; buy market orders and the attached trailing stop of a sell order still accept 10000.
