---
"@polyester/sdk": patch
---

An HTTP 413 now maps to the new `RequestTooLargeError` (code `"REQUEST_TOO_LARGE"`, not retryable) instead of a plain `RequestError`. Every service now refuses an oversized body with the same 413 problem, including ledger reads and API-key authentication of ConnectRPC calls. Send a smaller request; the size limit does not change. A ConnectRPC message over the limit still arrives as `resource_exhausted` and maps as before.
