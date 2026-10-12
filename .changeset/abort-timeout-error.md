---
"@polyester/sdk": minor
---

Add a `timeoutMs` request option, passed to Connect as the call deadline, so timed-out requests reject with `TimeoutError`. It must be a positive integer of at most 2147483647; other values throw `ValidationError`. `AbortSignal.timeout()` expiries also map to `TimeoutError`, whether the signal comes from the caller or an interceptor; previously they rejected as an abort or as a `ConnectError` with `Code.Canceled`. A caller signal that already expired before the call started still rejects as a non-retryable abort, so retry loops stop instead of spinning on it. `isTimeoutAbortError` is exported alongside `isAbortError`.
