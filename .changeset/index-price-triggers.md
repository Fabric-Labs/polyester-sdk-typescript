---
"@polyester/sdk": minor
---

Stop-loss, take-profit and trailing-stop triggers, and the attached `takeProfit`, `stopLoss` and `trailingStop` legs of an order, take `triggerPriceSource: "last" | "index"`. Omitted watches the last traded price as before. `"index"` watches the market's index price and waits while it is stale. Spot markets do not support `"mark"`, which the SDK rejects with `ValidationError`. Attached legs decode their `triggerPriceSource`.
