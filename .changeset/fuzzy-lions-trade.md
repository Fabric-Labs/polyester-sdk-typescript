---
"@polyester/sdk": minor
---

Align authenticated trade fills with the latest `UserTrade` protobuf contract.

- Decode `Trade.fee` from the exact E18 `U128` amount instead of the removed asset-scaled fee field.
- Add optional `Trade.referralShare` as an exact E18 decimal string and add `Trade.feeIsRebate` to distinguish rebates from charged fees.
- **Breaking:** remove `Trade.tradeId` and `Trade.subaccountId`; neither identifier exists in the upstream `UserTrade` response.
- Restore the `@polyester/sdk/unstable/gen` aggregate export and remove option-only generated descriptor modules.
