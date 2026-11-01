---
"@polyester/sdk": minor
---

Breaking: the whiteboard, layout and chart-layer APIs are no longer published. `client.whiteboard`, its types and the `@polyester/sdk/services/whiteboard` subpath are removed, as are the `whiteboardPb`, `layoutPb`, `polychartPb` and `polychartEventsPb` namespaces of `@polyester/sdk/unstable/gen`. The generated sub-account detail drops `includeBalances` and `balances`; read sub-account balances with the balances read and its sub-account filter.
