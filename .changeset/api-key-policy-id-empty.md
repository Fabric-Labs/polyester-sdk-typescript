---
"@polyester/sdk": minor
---

`ApiKey.policyId` is now `""` instead of `undefined` when no policy is attached, matching `DEFAULT_API_KEY_POLICY.id` so keys can be matched to policies by ID. `apiKeyPolicies.get({ policyId: "" })` now returns the default policy instead of throwing. Replace any `policyId === undefined` checks with `!policyId`.
