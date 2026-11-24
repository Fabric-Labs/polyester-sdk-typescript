---
"@polyester/sdk": patch
---

`tradingWithdraws.validateDestination` adds code `swap_deposit_address` for a QuickSwap deposit address, which can never receive a withdrawal, and withdraw error details add `DESTINATION_SWAP_DEPOSIT_ADDRESS`, the `ValidationError` a withdrawal or auto-withdraw rule to such an address gets.
