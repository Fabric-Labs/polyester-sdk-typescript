---
"@polyester/sdk": patch
---

`client.connectedApps` connects outside apps to the account with OAuth: `getAuthorization`, `approveAuthorization` (needs a fresh `stepUpToken`) and `denyAuthorization` drive the consent page, and `list` and `revoke` manage connected apps. Session only; API keys are refused.
