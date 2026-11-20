---
"@polyester/sdk": patch
---

`@polyester/sdk/unstable/gen` adds `strategiesPb` (bot strategies) and `accountScopePb`, which now holds `AccountScopeType` instead of `addressBookPb`. `quickswapExplorerPb` adds `getCompletedQuickSwap` and multi-asset and USD filters and replaces its stats rows with parallel lists, and `quickswapReferralPb` adds the referral ledger.
