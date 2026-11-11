---
"@polyester/sdk": patch
---

Ledger transfer types add `trading_withdraw_fee_leg`, `quickswap_polyester_fee`, `quickswap_broker_fee`, `quickswap_affiliate_fee`, `fee_sweep`, `fee_refill` and `system_adjustment`, in `transfers.list` rows and filters, `transfers.subscribe` and order transfer legs. These rows previously decoded as `"unspecified"`. A `system_adjustment` can be a seeding credit or a correction that debits the account, so read `isDebit` for its direction rather than counting it as a credit.
