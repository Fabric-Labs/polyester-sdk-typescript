---
"@polyester/sdk": minor
---

Breaking: `realtime.isConnected` is removed. It was true whenever a socket object existed, even one that never connected. Read `realtime.connection` instead: `{ public, private }`, each `{ state, error }`, where `state` is `"connecting"`, `"connected"` or `"disconnected"` and `error` is the first failure of the current outage, cleared once the socket connects. `realtime.onConnectionChange(listener)` calls the listener with the new value on every change and returns an unsubscribe function. Private order streams run on their own socket and are not included. Custom `PolyesterRealtime` implementations must add both members.

A realtime socket that cannot connect now reports it. On the first failed attempt, every channel on that socket gets one `onError` with `type: "transport"` and a retryable `RealtimeError`, not one per reconnect retry; a channel subscribed while the socket is still failing gets it on subscribe. The order book (whose snapshot waits for the channel to open) and trades no longer wait silently forever when the socket is unreachable; `onOpen` follows once it recovers.
