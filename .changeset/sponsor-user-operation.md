---
"@polyester/sdk": minor
---

Sponsor smart-account UserOperations with `pm_sponsorUserOperation` instead of `pm_getPaymasterData`, signing over client-buffered account gas limits, and cache the paymaster stub so warm-up removes one round trip per submission.
