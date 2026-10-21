---
"@polyester/sdk": minor
---

Add the Quick Swap broker API, signed-in Swaps, and per-request Quick Swap fees to `@polyester/sdk/unstable/gen`. `QuickSwapBrokerService` (`unstable/gen/swap/quickswap/v1/quickswap_broker_pb`) manages brokers, members, API keys, affiliate vaults, Quick Swap history, fee totals, and stats; `GetBroker` returns the broker's limits (`quoteRps`, `createRps`, `readRps`, `maxUnfundedAddresses`, `maxCreatesPerHour`, `maxAffiliateVaults`) and their current `usage`. `SwapService` (`unstable/gen/swap/v1/swap_pb`) quotes, creates, and reads Swaps of the signed-in account's own Trading balance.

Breaking changes in `unstable/gen/swap/quickswap/v1/quickswap_pb`:

- `AffiliateShare.sharePpm` is replaced by `bps`, the fee in basis points of what each leg receives, from 1 to 300.
- Quote and create requests take `brokerBps` and `affiliates`; a `QuickSwap` reports the requested fees in `fees` and the credited ones in `chargedFees`, replacing `QuickSwap.affiliates`.
- `FeeKind.INTEGRATOR` is replaced by `BROKER` (2) and `AFFILIATE` (3); `DEPOSIT_NETWORK` is now 4 and `WITHDRAWAL_NETWORK` 5.
- `ErrorCode.AFFILIATES_INVALID` is replaced by `FEES_INVALID`.

Policy actions and subaccount permissions decode the new `read-auto-withdraw`, `manage-auto-withdraw`, and `swap` actions (`read_auto_withdraw`, `manage_auto_withdraw`, and `swap` permissions), and policy inputs accept the three actions.
