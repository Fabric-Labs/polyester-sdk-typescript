---
"@polyester/sdk": patch
---

Sync the protobufs for Swaps, auto-withdraw, and the QuickSwap broker API, exported from `@polyester/sdk/unstable/gen` as `swapPb`, `autoWithdrawPb`, and `quickswapBrokerPb`. The SDK does not wire these services yet. Policy actions add `read-auto-withdraw`, `manage-auto-withdraw`, and `swap`, and sub-account permissions add `read_auto_withdraw`, `manage_auto_withdraw`, and `swap`, so policies and roles that grant them decode with their labels instead of as unknown. Order errors add `ERROR_CODE_MAX_QTY` and `ERROR_CODE_MAX_NOTIONAL`, and withdraw errors add `ERROR_CODE_INVALID_AUTO_WITHDRAW_SCHEDULE`.
