---
"@polyester/sdk": patch
---

`client.accountActivity.list` lists the security and activity events of the main account and its sub-accounts in one feed, newest first, filtered by sub-account, entity kind, action, source, API key (`apiKeyId`, the key's `keyId`) and time. Each event names its `subaccountId` (undefined for the main account). API keys need `read-account-activity`; a key scoped to a sub-account reads only that sub-account.
