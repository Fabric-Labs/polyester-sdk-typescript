---
"@polyester/sdk": patch
---

`PreparedTradingWithdraw` exposes `expiresAt`, the signed deadline, so callers can prepare again before it lapses (for example after a slow MFA step-up). Deadlines are computed from the server clock, learned from response `Date` headers, when known. `submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection (a deadline that lapsed in flight, or one signed from a device clock running behind before the server clock was learned) also maps to `WithdrawDeadlineExpiredError` instead of a generic `ValidationError`.
