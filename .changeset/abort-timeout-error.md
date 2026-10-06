---
"@polyester/sdk": minor
---

Add a `timeoutMs` request option, passed to Connect as the call deadline, so timed-out requests reject with `TimeoutError`. `catalog.refresh(options)` accepts request options and forwards them to both config fetches. `AbortSignal.timeout()` expiries also map to `TimeoutError`, whether the signal comes from the caller or an interceptor; previously they rejected as an abort or as a `ConnectError` with `Code.Canceled`.
