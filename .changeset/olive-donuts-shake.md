---
"@polyester/sdk": patch
---

fix(services): reject inputs that overflow their protobuf `uint32` field with a validation error, instead of accepting them and failing later in the encoder. Covers deposit and address-book chain IDs, market-data, candles and heatmap symbol IDs, `limit` on market overview, and `maxOpenOrders` on subaccount policies.
