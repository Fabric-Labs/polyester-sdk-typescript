---
"@polyester/sdk": patch
---

`PolicyAction` adds `read-price-alerts` and `manage-price-alerts`, which API keys now need for `priceAlerts.list` and for `create`, `update` and `cancel`. Both are main-account permissions, so sub-account policies reject them, and like price alerts they are available on devnet only.
