---
"@polyester/sdk": patch
---

Assistant `subagent_started` events carry `funding` (which adds `sponsored`) and `creditCap`, `subagent_finished` carries `deployUrl`, and tool events carry the `subagentId` of the subagent that made the call.
