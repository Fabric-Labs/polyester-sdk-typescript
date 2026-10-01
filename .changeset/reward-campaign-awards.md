---
"@polyester/sdk": patch
---

Add `rewards.listMyRewardAwards` (also `rewardsService(core)` from `@polyester/sdk/services/rewards`) to list published reward campaign awards for the authenticated root account, newest first. Each award includes its campaign, asset, exact `amountBaseUnits`, `fulfillmentMethod`, `fulfillmentState`, and `publishedAt`. `limit` accepts 0 through 100 (0 or omitted uses 50), and `pageToken` is capped at 256 characters. Requires a session token; API keys are not accepted.
