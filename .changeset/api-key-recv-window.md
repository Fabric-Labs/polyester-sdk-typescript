---
"@polyester/sdk": patch
---

API-key auth takes an optional `recvWindow`: a whole number of milliseconds from 1 to 60000, sent as `X-API-RECV-WINDOW` and signed on the line after the timestamp. The backend processes a request only until its timestamp plus the window, which defaults to 10000 when omitted. A value outside the range throws `ConfigurationError` before the request is sent. An `AUTH_RECV_WINDOW_INVALID` refusal maps to a non-retryable `ValidationError` rather than `AuthenticationError`, because the credentials are not at fault.
