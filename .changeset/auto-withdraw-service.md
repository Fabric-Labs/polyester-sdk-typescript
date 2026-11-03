---
"@polyester/sdk": patch
---

Add `autoWithdraw`, which manages an account's scheduled auto-withdraw rule: `getRule`, `setRule`, `disableRule` and `listRuns`. `setRule` and `disableRule` need a fresh `stepUpToken`, and a stale `expectedVersion` throws `RevisionConflictError`.
