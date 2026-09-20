---
"@polyester/sdk": minor
---

Sponsor smart-account UserOperations with `pm_sponsorUserOperation` instead of `pm_getPaymasterData`, signing over client-buffered account gas limits, and cache the paymaster stub so warm-up removes one round trip per submission. The stub is fetched once with a synthetic operation and reused, which relies on the Polyester paymaster returning constant stub data regardless of the operation or context.
