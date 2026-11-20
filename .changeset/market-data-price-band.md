---
"@polyester/sdk": patch
---

`client.marketData.getPriceBand` reads a pair's live price band: its reference price and the limit prices it admits now, with absent limits as `null`.
