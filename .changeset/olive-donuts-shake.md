---
"@polyester/sdk": patch
---

Reject inputs that overflow their protobuf `uint32` field with a typed validation error instead of failing open into an encode crash: deposit and address-book chain IDs, market-data/candles/heatmap symbol IDs, market-overview `limit`, and subaccount-policy `maxOpenOrders`
