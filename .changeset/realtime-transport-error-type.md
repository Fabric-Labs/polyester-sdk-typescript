---
"@polyester/sdk": patch
---

A realtime subscription whose transport can't be constructed (for example, no global `WebSocket` on the runtime) now reports `type: "transport_load"` to `onError` instead of `type: "auth"`.
