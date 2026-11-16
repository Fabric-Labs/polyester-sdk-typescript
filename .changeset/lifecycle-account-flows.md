---
"@polyester/sdk": patch
---

`client.lifecycle.listAccountFlows` and `getAccountFlow` read the signed-in account's own flows, including transfers between Trading accounts and other flows no chain transaction started. API keys need the `read-funding-flows` policy action.
