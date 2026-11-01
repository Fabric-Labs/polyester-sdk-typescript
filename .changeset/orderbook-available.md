---
"@polyester/sdk": patch
---

`orderbook.get` returns `available`. When it is false the book is being built or was invalidated: its levels are unknown, not empty, so read it again later instead of showing no liquidity. Order book subscriptions no longer emit such a snapshot as an empty book: it reaches `onError` as a `ServiceUnavailableError` and is retried, and the first event arrives once the book is available.
