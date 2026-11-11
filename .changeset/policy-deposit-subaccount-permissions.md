---
"@polyester/sdk": patch
---

`PolicyAction` adds seven account permissions for API-key policies: `create-deposit-address`, `read-deposit-addresses`, `read-subaccounts`, `read-subaccount-activity`, `read-subaccount-members`, `read-subaccount-invites` and `read-guard-signer-status`. API keys now need them for the deposit-address, sub-account and Guard Signer reads, so add them to existing key policies that use those calls. A sub-account policy refuses them, so `subaccounts.policies.create` and `update` reject them with `ValidationError` before sending.
