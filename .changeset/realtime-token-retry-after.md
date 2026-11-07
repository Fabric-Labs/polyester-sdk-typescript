---
"@polyester/sdk": patch
---

Realtime token requests honor `Retry-After`. When the connection or subscription token endpoint answers 429 with a `Retry-After` header, the `RateLimitError` carries it as `retryAfterMs`, and the realtime client sends no further token request until it has passed (at most 60 seconds), even when the socket retries sooner. This covers public, private and private order stream sockets.
