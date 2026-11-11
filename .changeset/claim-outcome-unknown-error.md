---
"@polyester/sdk": patch
---

A daily claim whose payout was submitted but not confirmed maps to the new `ClaimOutcomeUnknownError` (code `"CLAIM_OUTCOME_UNKNOWN"`, retryable), which carries the claim's `claimId`. Before, `claims.claimDailyReward` answered with a timeout in this case. Show the claim as pending, not failed: it is never paid twice, so poll `claims.getDailyClaimStatus` until its `claimId` is `claimed`, or call `claimDailyReward` again. Both calls now also accept an API key scoped to the main account whose policy grants `read-daily-claims` or `claim-daily-reward`.
