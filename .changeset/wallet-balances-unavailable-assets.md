---
"@polyester/sdk": patch
---

`tradingWithdraws.getWalletBalances` adds `unavailableAssets`: zTokens whose balance could not be read, with a `reason` (`no_contract`, `read_failed` or `invalid_balance`). Their balance is unknown, not zero; the read is complete only when the list is empty.
