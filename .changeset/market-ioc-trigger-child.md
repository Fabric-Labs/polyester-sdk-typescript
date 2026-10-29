---
"@polyester/sdk": minor
---

Buy stop-loss and take-profit triggers accept a `market_ioc` child. A `market_ioc` child takes an optional `maxSlippage`: 1 to 10000 bps for a buy, 1 to 9999 for a sell. Without it, the pair's default market slippage applies. Trigger configurations decode the child's `maxSlippage`.
