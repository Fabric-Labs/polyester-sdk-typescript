---
"@polyester/sdk": patch
---

A server timeout (`deadline_exceeded` or a 504) on `apiKeys.create`, API-key policy create, sub-account policy create and MFA recovery-code regeneration now throws `OutcomeUnknownError` (`retryable: false`) instead of a retryable `TimeoutError` or `ServiceUnavailableError`. The write may have been applied, so read it back before trying again. Reads and client-side timeouts are unchanged.
