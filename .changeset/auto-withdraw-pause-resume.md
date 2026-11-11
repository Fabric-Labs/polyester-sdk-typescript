---
"@polyester/sdk": minor
---

Auto-withdraw rules now pause and resume instead of being disabled. `autoWithdraw.disableRule` is removed: call `autoWithdraw.setRuleEnabled({ expectedVersion, enabled: false })` to pause, which needs no step-up, and `enabled: true` with a fresh `stepUpToken` to resume. A paused version keeps its schedule and destinations, so it resumes to the same addresses; resuming checks every destination again and clears a pause the rule set itself. Treat a rule as running only while `enabled` is true and `pause` is null. Rules add `createdByAccountId`, the public account ID of whoever created the version. A stale `expectedVersion`, now sent as the withdraw code `VERSION_CONFLICT`, still throws `RevisionConflictError`.
