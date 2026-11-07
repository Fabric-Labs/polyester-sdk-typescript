---
"@polyester/sdk": minor
---

Breaking: `realtime.isConnected` is removed. It was true whenever a socket object existed, even one that never connected. Read `realtime.connection` instead: `{ public, private }`, each `{ state, error }`, where `state` is `"connecting"`, `"connected"` or `"disconnected"` and `error` is the first failure of the current outage (a socket failure after a connection token failure replaces it), cleared once the socket connects. `realtime.onConnectionChange(listener)` calls the listener with the current value after each change, in a microtask, and returns an unsubscribe function. Private order streams run on their own socket and are not included. Custom `PolyesterRealtime` implementations must add both members.

A realtime socket that cannot connect now reports it. On the first failed attempt, every channel on that socket gets one `onError` with `type: "transport"` and a retryable `RealtimeError`, not one per reconnect retry; a channel subscribed while the socket is still failing gets it on subscribe. On the private socket, a failed connection token request is reported as `"connection_token"` on each attempt instead. The order book (whose snapshot waits for the channel to open) and trades no longer wait silently forever when the socket is unreachable; `onOpen` follows once it recovers.

Once a channel's unsubscribe function has run, that consumer gets no further `onError` or `onUnsubscribed`, even from a notification already in progress (for example, unsubscribing from inside a terminal close's `onError` no longer also calls `onUnsubscribed`). Channels that actually closed are still told, even if a handler calls `disconnect()` meanwhile.
