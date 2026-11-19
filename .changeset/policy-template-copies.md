---
"@polyester/sdk": patch
---

`apiKeyPolicies.apply` and `subaccountPolicies.apply` return the attached `policyId`, a new copy when the applied policy is a template. Policies report `sourceTemplateRevision`, and `subaccountPolicies.create` takes `isTemplate`.
