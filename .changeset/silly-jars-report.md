---
"@polyester/sdk": patch
---

fix(orderbook): stop `orderbook.createSubscription()` from subscribing to order-book delta channels that have no publisher. The backend only publishes `public:spot:orderbook:deltas:depth:{depth}:...` for depths `1, 20, 50, 200, 500`, but the REST snapshot accepts `1, 5, 10, 20, 50, 100, 200, 500, 1000`. Passing one of the REST-only depths (for example `depth: 10`) subscribed successfully and then never delivered a publication, leaving the book permanently empty with no `onError`. Requested depths now ride the smallest published channel depth that covers them and are sliced back down locally, so every documented depth delivers updates.
