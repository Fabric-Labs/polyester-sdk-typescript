---
"@polyester/sdk": patch
---

`subaccounts.subscribe` and `subaccounts.policies.subscribePolicies` take `delegated: true`, and `addressBook.subscribeViewInvalidations` takes `subaccounts: true`, for the records reached through a subaccount role, which the default streams no longer carry. Signed-in sessions only.
