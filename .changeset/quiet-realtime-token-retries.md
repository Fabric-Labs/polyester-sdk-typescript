---
"@polyester/sdk": patch
---

Stop automatic realtime connection and subscription token retries for non-retryable SDK errors while preserving the original errors in `onError`. Transient failures retain Centrifuge backoff, and explicit private subscriptions can restart after authentication or request inputs are corrected.
