---
"@polyester/sdk": patch
---

`orderbook.get` returns the snapshot's `ts`, `orders.cancelAll` returns `tsNs`, and `internalTransfers.create` returns `acceptedAtNs`, fields the server already sent but the SDK dropped.
