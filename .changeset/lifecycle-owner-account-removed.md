---
"@polyester/sdk": minor
---

Breaking: `lifecycle.listFlows` selects an account only by `{ kind: "smartAccountAddress" }`; the `accountId` and `ownerAccountId` selectors are gone, and flow summaries and transaction matches no longer carry `ownerAccountId`. Use `listAccountFlows` for the signed-in account's flows.
