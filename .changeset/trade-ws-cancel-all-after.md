---
"@polyester/sdk": patch
---

`tradeWsPb` in `@polyester/sdk/unstable/gen` adds the `cancelAllAfter` client command and acknowledgement, which arm, refresh or disarm the account's dead-man switch, plus the `ClientFrame` fields `timestampMs` and `recvWindowMs`, which set a per-command receive window. The SDK has no trading WebSocket client yet.
