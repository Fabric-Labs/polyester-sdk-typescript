---
"@polyester/sdk": patch
---

A server or client-side timeout (`deadline_exceeded`, 504, `timeoutMs`, or `AbortSignal.timeout()`) or dropped connection (`NetworkError`) on `apiKeys.create`, API-key policy create, sub-account policy create and MFA recovery-code regeneration now throws `OutcomeUnknownError` (`retryable: false`) instead of a retryable `TimeoutError`, `ServiceUnavailableError`, or `NetworkError`. The write may have been applied, so read it back before trying again. Reads and caller cancellations are unchanged.
