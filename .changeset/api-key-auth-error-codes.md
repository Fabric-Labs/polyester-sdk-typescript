---
"@polyester/sdk": patch
---

API key refusals on ConnectRPC now carry an auth `detail.code` that names the reason: `AUTH_SIGNATURE_INVALID`, `AUTH_TIMESTAMP_SKEW`, `AUTH_MISSING_HEADERS`, `AUTH_KEY_EXPIRED`, `AUTH_KEY_DISABLED`, `AUTH_IP_NOT_ALLOWED` or `AUTH_API_KEY_NOT_ACCEPTED`. `AUTH_TIMESTAMP_SKEW` still maps to the retryable `TimestampSkewError`, and a retry signs the request again.
