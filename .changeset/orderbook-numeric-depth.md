---
"@polyester/sdk": minor
---

Breaking: `orderbook.get` sends `depth` as given instead of rounding it to a fixed set, so it must be a positive integer and a depth above the server's `maxDepth` is rejected. Snapshots return `bookEpoch` and `maxDepth`, and order book subscriptions discard a refetched snapshot from an older epoch.
