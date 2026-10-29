---
"@polyester/sdk": minor
---

Sync the public protobuf contract to `b634f1846112e51a700d3d3827351f6bf9880728`.

- Stop-loss, take-profit and trailing-stop triggers, and the attached `takeProfit`, `stopLoss` and `trailingStop` legs of an order, take `triggerPriceSource: "last" | "index"`. Omitted watches the last traded price as before. `"index"` watches the market's index price and waits while it is stale. Spot markets do not support `"mark"`, which the SDK rejects with `ValidationError`. Attached legs decode their `triggerPriceSource`.
- `triggers.modify` and `triggers.resume` no longer require `symbolId`. Omitted, it targets the trigger's own market; when set, it must be that market. An API key limited to specific markets must still pass it.
- Trigger `cancelReason` adds `account_repair` and, for a disabled market, `pair_drain_trigger`, `pair_drain_twap`, `pair_drain_ladder` and `pair_drain_attached_leg`. Show the drain reasons as "market disabled", not as a user cancel. `failureReason` adds `index_price_unavailable` and `trigger_would_trigger_immediately`.
- `orders.cancelAll` returns `listingStatus`. A retry with the same `requestId` returns `"not_retained_read_open_orders"` with an empty `cancelledOrders`, which does not mean nothing was canceled; read open orders instead.
- `orders.cancelAllAfter` returns the armed switch's `effectiveScope`: `{ accountId, symbolId, side }`, where an unset `symbolId` or `side` covers all of them. It is absent while the switch is disabled.
- `orders.getDetails` returns `executionsComplete`. It is true once the trades across every page add up to the filled quantity; while it is false, read again for the rest.
- `orders.subscribe`'s `onStale` receives `orderIds` when only those orders are behind. Their rows show an earlier state while the rest of the view is current. A later call replaces the earlier one, and `onStale(false)` means every order is current again.
- `tradingRateLimits.getConfig` and `vip.listTiers`, the public catalog reads, now use cacheable ConnectRPC GET. Requests to testnet stay on POST until testnet supports GET.
- Pair status adds `halted`: only cancellations are accepted.
- Lifecycle flows add `isDelayed` on summaries, `milestoneTxChainId` on steps and `txChainId` on step activities. The lifecycle reason adds `deposit_source_not_confirmed` and the lifecycle source adds `lifecycle`.
- `AUTH_TEMPORARILY_UNAVAILABLE` maps to a retryable `ServiceUnavailableError`. `OrderErrorCode` adds `TRIGGER_WOULD_TRIGGER_IMMEDIATELY`, `ORDER_CREATE_OUTCOME_UNKNOWN` and `TRIGGER_CREATE_OUTCOME_UNKNOWN`.
- Breaking: every order and trigger outcome-unknown code (`ORDER_CREATE_OUTCOME_UNKNOWN`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `TRIGGER_CREATE_OUTCOME_UNKNOWN` and `TRIGGER_CONTROL_OUTCOME_UNKNOWN`) now throws the new non-retryable `OutcomeUnknownError` instead of a retryable `TimeoutError`. The change may already have applied, so read the order by its client order ID, or list triggers by client trigger ID, before sending it again. `detail.code` names the operation. A deadline without one of these details is still a retryable `TimeoutError`.
