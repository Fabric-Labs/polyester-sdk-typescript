---
"@polyester/sdk": minor
---

Expose exact authenticated trade economics. `Trade.fee` now decodes the protobuf's E18 `U128` amount instead of the removed asset-scaled fee field. `Trade.referralShare` exposes the optional E18 referral amount, and `Trade.feeIsRebate` distinguishes rebates from charged fees.
