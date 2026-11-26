---
"@polyester/sdk": patch
---

Assistant approvals add the `cancelled` status for a run that ended before a decision. A `RUN_ACTIVE` error detail carries `pendingApprovalId` while the run waits for an approval.
