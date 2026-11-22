---
"@polyester/sdk": patch
---

`accountActivity.list` and `subaccounts.listEvents` return `actorAccountId: undefined` for events with no recorded actor instead of `"1"`, the public ID of account 0.
