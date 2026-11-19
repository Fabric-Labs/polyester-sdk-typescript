---
"@polyester/sdk": minor
---

Breaking: `orderbook.get` takes `depth` as a depth tier (1, 5, 10, 20, 50, 100, 200, 500, 1000 or 5000, default 50) and throws `ValidationError` for any other count before sending. Snapshots report the tier they were served at in `depth` and no longer return `maxDepth`.
