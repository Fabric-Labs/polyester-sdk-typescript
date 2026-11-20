---
"@polyester/sdk": patch
---

`client.tradingWithdraws.createToFundingBatch` and `prepareToFundingBatch` move up to 10 amounts from one Trading account to Funding accounts with one wallet signature and one MFA check. The legs move together or not at all.
