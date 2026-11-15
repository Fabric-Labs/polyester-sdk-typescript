---
"@polyester/sdk": patch
---

`realtime.connectPrivateOrders` delivers `{ type: "ready" }` once the stream reflects every order change acknowledged before it subscribed, again after each resubscribe or reconnect, and replayed after the snapshot to a consumer that joins later. `orders.subscribe` calls the new `onReady` for it.
