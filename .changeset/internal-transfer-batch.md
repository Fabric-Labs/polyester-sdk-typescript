---
"@polyester/sdk": patch
---

`client.internalTransfers.batchCreate` moves up to 500 transfers together under one idempotency key and one MFA check: every leg is credited or nothing moves. The batch is `accepted`, `refused` or, when its outcome is not known within the request, `processing`; each leg is `credited`, `not_moved` or `processing`, with `creditedAtUnixMs` once credited.
