---
"@polyester/sdk": patch
---

A wallet login refused with `AUTH_WALLET_ALREADY_LINKED` maps to a non-retryable `AlreadyExistsError`. The wallet already belongs to another account, so the same login fails again. Log in with the account address the wallet already uses.
