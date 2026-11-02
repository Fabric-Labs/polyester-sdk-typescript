---
"@polyester/sdk": patch
---

An order's attached `risk.trailingStop` takes `limitPrice`, the most its buy-back pays per unit. A selling order's attached trailing stop buys back, and the API now rejects it without this price, so `limitPrice` is required when the order sells and must be omitted when it buys; the SDK rejects either mismatch with `ValidationError` before sending. It must be at least `activationPrice` when both are set. `orders.modify` and batch replace pass it through; the API checks it against the order's side.
