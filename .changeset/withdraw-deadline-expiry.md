---
"@polyester/sdk": patch
---

`PreparedTradingWithdraw` exposes `expiresAt`, the signed deadline, so callers can prepare again before it lapses (for example after a slow MFA step-up). `submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection also maps to `WithdrawDeadlineExpiredError`, a `ValidationError` subclass, instead of a generic `ValidationError`.

Deadlines are computed from the server clock when the SDK can read the response `Date` header, and from the device clock otherwise. Browsers can only read that header when the API lists `Date` in `Access-Control-Expose-Headers`; without it, a device clock running more than five minutes behind still produces deadlines the backend rejects, now as `WithdrawDeadlineExpiredError`.
