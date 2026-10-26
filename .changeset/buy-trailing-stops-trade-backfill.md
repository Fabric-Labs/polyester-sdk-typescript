---
"@polyester/sdk": minor
---

Sync the public protobuf contract to `24567cc6b89df942f167e6faec3fb98bc306cae7`.

- Trailing-stop triggers can buy. Pass `side: "buy"` with a `limitPrice`, the most the child pays. It must be at least `activationPrice` when that is set. A sell trailing stop is still the default and rejects `limitPrice`. Trigger configurations decode `limitPrice` for a buy trailing stop.
- Buy stop-loss and take-profit triggers accept a `market_ioc` child. A `market_ioc` child takes an optional `maxSlippage`: 1 to 10000 bps for a buy, 1 to 9999 for a sell. Without it, the pair's default market slippage applies. Trigger configurations decode the child's `maxSlippage`.
- Attached trailing stops now take 1 to 9999 bps `maxSlippage` on either side. The trailing stop of a sell order previously accepted 10000, which the backend now rejects.
- Breaking: `triggers.modify` no longer takes `limitPrice`, because the backend rejects any change to a child's limit price. Cancel the trigger and create a new one instead.
- `orders.cancelAll` returns `cancelledOrders`: up to 200 `{ orderId, clientOrderId }` entries, oldest first. It also returns `totalCancelled`, and `truncated` when not every canceled order is listed.
- `marketData.listTrades` takes `afterTradeId` (a uint64 decimal string; start from `"0"`) to walk a symbol's trades oldest first with no gaps. The result then carries `backfill` with `completeThroughTradeId`, `nextAfterTradeId` and `epochEnds`. `afterTradeId` cannot be combined with `side`, `startTsNs`, `endTsNs` or `pageToken`. Uint64 decimal filters such as `startTsNs` now reject values above 18446744073709551615 with `ValidationError` instead of failing to encode.
- Candle timeframes add `3m`, `2h`, `6h`, `8h` and `3d`.
- Daily claims add the `payout_delayed` state and `payoutDelayReason`, a claims error code name such as `CLAIM_PAYOUT_UNAVAILABLE`.
- VIP status adds `settledVolumeQuality` and `averageAopQuality`, each `{ status, incompleteHours }` with status `complete`, `price_unavailable` or `incomplete_history`. With `price_unavailable`, `settledVolume30dUsd` is a lower bound.
- Trigger `failureReason` adds `child_order_inconsistent`. `OrderErrorCode` adds `CHILD_QTY_EXCEEDS_REMAINING`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `ORDER_REPAIRING`, `ACCOUNT_REPAIRING` and `QUICKSWAP_ACCOUNT_OWNER_UNKNOWN`. For either outcome-unknown code, read the order back before retrying. Claims errors add `CLAIM_PAYOUT_UNAVAILABLE`.
- `@polyester/sdk/unstable/gen` adds `QuickSwapBrokerService.GetQuickSwap` and the new QuickSwap status reasons.
