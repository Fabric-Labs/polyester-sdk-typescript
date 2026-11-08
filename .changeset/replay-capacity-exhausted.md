---
"@polyester/sdk": patch
---

A signed request refused with `AUTH_REPLAY_CAPACITY_EXHAUSTED` maps to a retryable `RateLimitError` without `retryAfterMs`. Before, a full replay store answered `SIGNATURE_INVALID`. Now each API key and account holds a fixed share, so only the key or account at its share is refused. Back off briefly and retry, which signs again. A shorter `recvWindow` frees room sooner.
