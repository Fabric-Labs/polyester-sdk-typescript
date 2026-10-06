---
"@polyester/sdk": minor
---

Add a `timeoutMs` request option, passed to Connect as the call deadline, so timed-out requests reject with `TimeoutError`. It must be a positive integer of at most 2147483647; other values throw `ValidationError`. `AbortSignal.timeout()` expiries also map to `TimeoutError`, whether the signal comes from the caller or an interceptor; previously they rejected as an abort or as a `ConnectError` with `Code.Canceled`. `isTimeoutAbortError` is exported alongside `isAbortError`.
