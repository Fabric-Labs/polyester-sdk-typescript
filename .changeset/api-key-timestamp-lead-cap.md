---
"@polyester/sdk": patch
---

API-key signing timestamps lead the local clock by at most 500 ms. A burst that signs more requests than milliseconds pass now waits for the clock instead of running past the backend's 1000 ms future limit and getting `TimestampSkewError`. Timestamps still strictly increase, and a single call or a slow sequence is signed as before. This covers `createApiKeyEd25519AuthHeaders` and every `api-key-ed25519` client.
