---
"@polyester/sdk": patch
---

`PreparedTradingWithdraw.submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection also maps to `WithdrawDeadlineExpiredError`, a `ValidationError` subclass, instead of a generic `ValidationError`.

Deadlines default to five minutes from now on the server clock, learned from a wallet login challenge's `Issued At`, and on the device clock otherwise; `isExpired()` uses the same clock. Trading withdraw inputs accept an optional `deadline` to sign a different expiry.
