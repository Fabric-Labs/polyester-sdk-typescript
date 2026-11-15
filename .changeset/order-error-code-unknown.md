---
"@polyester/sdk": patch
---

An order error code newer than the installed SDK now reads as `"UNSPECIFIED"` instead of throwing `ValidationError`, so `orders.preview` keeps `admissible: false`, and rejected items in `orders.batchCreate`, `orders.batchCancel` and `orders.getBatchReplaceStatus` still decode. A newer account code in `balances.getBalanceHistory` and `balances.getEquityHistory` series reads as `"unspecified"`.
