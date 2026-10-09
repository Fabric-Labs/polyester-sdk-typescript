---
"@polyester/sdk": patch
---

`PreparedTradingWithdraw` exposes `expiresAt`, the signed deadline, so callers can prepare again before it lapses (for example after a slow MFA step-up). `submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection also maps to `WithdrawDeadlineExpiredError`, a `ValidationError` subclass, instead of a generic `ValidationError`.

Deadlines default to five minutes from now on the server clock, learned from a wallet login challenge's `Issued At`, and on the device clock otherwise. Trading withdraw inputs accept an optional `deadline` to sign a different expiry.
