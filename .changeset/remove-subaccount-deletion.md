---
"@polyester/sdk": minor
---

**Breaking:** Remove `subaccounts.delete()`, the `DeleteSubaccountInput` type and schema, and the `"deleted"` subaccount status. `auth.v1.SubaccountService` exposes no delete RPC, and both `Subaccount.status` and `SubaccountUpdateSpec.status` document only `"active"` and `"disabled"`, so `delete()` was sending a `status: "deleted"` update the backend does not accept. Use `subaccounts.update({ status: "disabled" })` instead; `status` on reads and updates is now `"active" | "disabled"`.
