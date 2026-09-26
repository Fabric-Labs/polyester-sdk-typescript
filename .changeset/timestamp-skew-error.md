---
"@polyester/sdk": patch
---

Map API-key `TIMESTAMP_SKEW` rejections to a new retryable `TimestampSkewError` (`code: "TIMESTAMP_SKEW"`) instead of a generic non-retryable `AuthenticationError`. This covers both `application/problem+json` and Connect error responses. Retrying the call signs it again with a fresh timestamp. For large bursts of API-key requests, bound concurrency so requests don't wait in the runtime's fetch queue past the skew window.
