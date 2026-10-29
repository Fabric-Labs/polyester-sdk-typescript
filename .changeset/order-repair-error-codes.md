---
"@polyester/sdk": patch
---

Trigger `failureReason` adds `child_order_inconsistent`. `OrderErrorCode` adds `CHILD_QTY_EXCEEDS_REMAINING`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `ORDER_REPAIRING`, `ACCOUNT_REPAIRING` and `QUICKSWAP_ACCOUNT_OWNER_UNKNOWN`. For either outcome-unknown code, read the order back before retrying.
