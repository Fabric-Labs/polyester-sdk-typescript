---
"@polyester/sdk": patch
---

`internalTransfers.create` and `internalTransfers.batchCreate` now accept quantities with up to 18 decimals, so a balance from `balances.list` can be transferred exactly as reported. They no longer cap input at the asset's order-quantity scale.
