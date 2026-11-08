---
"@polyester/sdk": patch
---

A ConnectRPC `resource_exhausted` that carries a `RateLimitDetail`, as wallet sign-in and the public catalog calls now send, maps to a `RateLimitError` with `rateLimit` set and `retryAfterMs` taken from the detail. Its `detail` is `{ service: "rate_limit", code: "RATE_LIMIT_EXCEEDED", rateLimit }`. The gateway's own refusal has no detail: `retryAfterMs` comes from `Retry-After` when present and is `undefined` for a concurrency refusal, so back off without a server hint.
