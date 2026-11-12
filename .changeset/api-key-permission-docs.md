---
"@polyester/sdk": patch
---

`checkpoints.list` docs no longer say API keys are refused: an API key scoped to the main account whose policy grants `read-checkpoints` can call it. Each method that API keys can now call names the permission it needs in its docs: API keys, policies, profile, accounts, social verification, VIP status, deposit addresses, withdraw validation, Guard Signer status and the sub-account reads.
