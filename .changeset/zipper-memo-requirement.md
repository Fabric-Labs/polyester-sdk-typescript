---
"@polyester/sdk": patch
---

Chain configs from `zipper.getDepositWithdrawConfig` and the catalog add `memoRequirement` (`"required"`, `"optional"`, `"not_supported"` or `"unspecified"`), `memoLabel` (such as `"Destination tag"`) and `memoFormatHint`. The requirement covers withdrawal destinations and QuickSwap destination, return and refund targets, not deposit instructions. Use it as the rule and the label and hint for display only, without parsing the hint. Treat `"unspecified"`, or a value absent from an older catalog snapshot, as unknown: never assume the memo can be omitted.
