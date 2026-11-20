---
"@polyester/sdk": patch
---

`client.connectedApps` connects outside apps to the account with OAuth: `getConnectionRequest`, `approveConnectionRequest` (needs a fresh `stepUpToken`) and `denyConnectionRequest` drive the consent page, and `list` and `revoke` manage connected apps. Session only; API keys are refused.
