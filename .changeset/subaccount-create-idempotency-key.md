---
"@polyester/sdk": patch
---

`subaccounts.create` and `auth.createSubaccount` accept an optional `idempotencyKey` so a retry never creates a second sub-account: resending the identical signed request returns the one it created with `replayed: true`, and any other request under the key throws `AlreadyExistsError` (`AUTH_SUBACCOUNT_IDEMPOTENCY_CONFLICT`); find that sub-account in `subaccounts.list()` by its new `idempotencyKey`.
