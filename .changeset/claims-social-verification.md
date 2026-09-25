---
"@polyester/sdk": patch
---

Surface the claims `SOCIAL_VERIFICATION_REQUIRED` error code as a non-retryable `PreconditionFailedError` detail when a daily reward claim needs a verified X or Discord account.
