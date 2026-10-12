---
"@polyester/sdk": patch
---

`PreparedTradingWithdraw.submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection also maps to `WithdrawDeadlineExpiredError`, a `ValidationError` subclass, instead of a generic `ValidationError`.

Trading withdraw inputs accept an optional `deadline` to sign a different expiry.

Wallet-signed withdraws sign a fresh deadline and nonce, with the same idempotency key, when `submit` is called within a minute of the deadline, so a retry after a slow MFA step-up just works; `deadline` then reflects the new signature. Payload-signed withdraws can't be signed again: prepare them again before resubmitting.
