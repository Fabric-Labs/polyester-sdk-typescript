---
"@polyester/sdk": patch
---

Unsubscribing from a private channel, or from `connectPrivateOrders()`, in the same tick as subscribing without credentials no longer delivers the queued missing-authentication error to that consumer's `onError`.
