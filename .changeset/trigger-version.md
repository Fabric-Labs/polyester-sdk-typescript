---
"@polyester/sdk": patch
---

Triggers return `version`: 1 for a trigger's first state, higher for every later change. Across `triggers.get`, `triggers.list` and `triggers.subscribe`, keep the copy with the highest version and ignore copies whose version is not higher than the one you hold, since a reconnect can repeat an earlier state.
