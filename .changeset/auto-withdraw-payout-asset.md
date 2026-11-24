---
"@polyester/sdk": patch
---

Auto-withdraw rules can pay out in one asset: `setRule` takes a `payoutAssetId` and `conversionTwapDurationMs`, and each run first converts every other asset into it through swaps from the account. Runs add the `converting` state and their `conversions`, and preview assets add the `conversion` quote with the `converts` hold reason.
