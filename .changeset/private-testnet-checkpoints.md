---
"@polyester/sdk": patch
---

Add `checkpoints.list({ subaccountId })`, which returns the signed-in account's testnet season checkpoints, newest first, and is empty when the account has none. It needs a session login; API keys are refused with `PERMISSION_DENIED`. A `subaccountId` reads its root account's checkpoints, and one that decodes to zero throws `ValidationError`. USD values are decimal strings and are `undefined`, not zero, when unavailable; `incomplete` lists the values computed from partial evidence. The generated protobufs are exported from `@polyester/sdk/unstable/gen` as `checkpointsPb`.
