---
"@polyester/sdk": patch
---

`subaccounts.policies.apply` only clears the binding for `policyId: null`. A blank or whitespace `policyId` now throws `ValidationError("policyId: empty")` before any request is sent.
