---
"@polyester/sdk": patch
---

`subaccounts.get` accepts `includeBalances: true` and then returns the sub-account's current `balances`, in the shape of `balances.list`. It needs the read-balances action on the sub-account or fails with PermissionDenied. When balances cannot be read right now it fails with the retryable `AUTH_TEMPORARILY_UNAVAILABLE`. Without `includeBalances`, `get` is unchanged and returns no `balances`.
