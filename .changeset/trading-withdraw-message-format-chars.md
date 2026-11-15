---
"@polyester/sdk": patch
---

Wallet-signed trading withdraws also refuse line and paragraph separators and format characters, such as a right-to-left override or a zero-width space, in the destination and idempotency key, so the signing prompt reads the same as the signed message.
