---
"@polyester/sdk": patch
---

`PolicyAction` adds thirteen account permissions for API-key policies: `read-api-keys`, `read-api-policies`, `read-subaccount-policies`, `read-subaccount-permissions`, `read-vip-status`, `read-social-verification`, `read-profile`, `read-account-directory`, `read-withdraw-validation`, `read-daily-claims`, `claim-daily-reward`, `read-checkpoints` and `read-rewards`. Each grants exactly the calls it names, so an API key can now list API keys and policies, read sub-account permissions, VIP status, social verification, profile, checkpoints and reward awards, resolve accounts, validate withdraw destinations, and read or claim the daily reward. Permissions for main-account data apply only to a key scoped to the main account. A sub-account policy refuses account permissions, so `subaccounts.policies.create` and `update` now reject them with `ValidationError` before sending.
