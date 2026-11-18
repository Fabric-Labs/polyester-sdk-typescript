---
"@polyester/sdk": patch
---

`ServiceUnavailableError` carries the server's `Retry-After` as `retryAfterMs`, as `RateLimitError` already does.
