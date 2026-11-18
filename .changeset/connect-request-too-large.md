---
"@polyester/sdk": patch
---

A ConnectRPC request over the API's size limit now throws the non-retryable `RequestTooLargeError`, as a REST 413 does, instead of a retryable `RateLimitError`.
