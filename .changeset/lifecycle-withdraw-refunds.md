---
"@polyester/sdk": patch
---

Lifecycle steps add `refundAddress`, the Polyester Chain smart account a rejected withdrawal's zTokens were returned to. It is set only on a withdrawal's `refunded` step and is `""` otherwise. Request fees add the status `"kept"`, a fee charged although the request did not complete, and lifecycle reasons add `zipper_compliance_transferred`, a deposit whose funds were moved out by compliance, which is not a refund. `tradingWithdraws.getWalletBalances({ account })` reads the zTokens that wallet holds, with `amount` as a decimal string, so you can offer to move a refund back. API keys need `read-balances`.
