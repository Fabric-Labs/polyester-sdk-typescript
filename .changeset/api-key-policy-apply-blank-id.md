---
"@polyester/sdk": patch
---

`apiKeys.policies.apply` now throws `ValidationError` for a blank `policyId` (`""` or whitespace) instead of clearing the key's policy. Pass `null` to clear the binding.
