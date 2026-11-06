---
"@polyester/sdk": patch
---

`Subaccount` records now carry `removed`. `subaccounts.subscribe` emits `removed: true` (with `role: "unspecified"`) when the caller loses access to a subaccount, for example after the owner removes them as a member, so drop it from local state. List and get responses always return `false`. Access and role changes do not bump `revision` or `updatedAt`, so apply them in arrival order.
