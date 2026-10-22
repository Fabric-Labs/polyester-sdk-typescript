---
"@polyester/sdk": minor
---

`claims.claimDailyReward` takes an input object before the request options, so `claimDailyReward({ subaccountId })` pays the daily reward to a subaccount owned by the authenticated root account. Omit `subaccountId` to pay the root account as before. Breaking: pass request options as the second argument, as in `claimDailyReward({}, { signal })`; options passed first now throw `ValidationError`. A `subaccountId` that decodes to zero also throws `ValidationError` instead of silently paying the root account. The first claim of the day fixes the destination, and retries return that claim and its destination. `DailyClaimStatus` and `ClaimDailyRewardResult` add `subaccountId`, which is `undefined` when the reward goes to the root account. Claims errors add `SUBACCOUNT_NOT_FOUND` and `SUBACCOUNT_INACTIVE`.
