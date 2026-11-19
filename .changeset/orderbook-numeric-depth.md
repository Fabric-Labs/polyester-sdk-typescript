---
"@polyester/sdk": patch
---

Order book snapshots return `bookEpoch`, and order book subscriptions discard a refetched snapshot from an older epoch.
