---
"@polyester/sdk": minor
---

Breaking: `orderbook.createSubscription()` and `orderbook.subscribe()` throw `ValidationError` for a `depth` above 500 instead of silently serving 500 levels. A realtime subscribe the server refuses, including a resubscribe after a server unsubscribe, now reports a non-retryable error with the server's code and message through `onError` before `onUnsubscribed`, instead of only closing.
