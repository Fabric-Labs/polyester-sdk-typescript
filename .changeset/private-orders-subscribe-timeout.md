---
"@polyester/sdk": patch
---

`realtime.connectPrivateOrders` and `orders.subscribe` no longer wait forever for a subscribe the server never answers. After 30 seconds a subscription the server never confirmed ends with a retryable `subscribe` error and `onDisconnected`; one it confirmed before reports the error and subscribes again. A late confirmation of the expired request is unsubscribed.
