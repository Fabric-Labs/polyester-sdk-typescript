---
"@polyester/sdk": patch
---

`apiKeys.setStrategyBotAccess` gives a strategy bot its trade key on its own sub-account, bounded by trading limits, and `apiKeys.endStrategyBotAccess` revokes it. Both are safe to retry under the same `deployOperationId`.
