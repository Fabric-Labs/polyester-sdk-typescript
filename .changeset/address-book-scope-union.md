---
"@polyester/sdk": minor
---

Decode address-book account scopes as the `AddressBookAccountScope` union keyed by `scopeType`. Root scopes no longer expose the wire placeholder `subaccountId` (previously `"1"`), subaccount scopes always include `subaccountId`, and unspecified scopes include it only when non-zero. Narrow on `scopeType` before reading `scope.subaccountId`.
