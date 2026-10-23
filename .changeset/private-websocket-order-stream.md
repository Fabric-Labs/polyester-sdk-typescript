---
"@polyester/sdk": minor
---

Stream `orders.subscribe` over the private WebSocket (`/v1/ws/private`), since the realtime channels `private:spot:orders:<account>` (JSON and `:proto`) and `private:spot:orders:batch-replace:<account>` are no longer served. `onEvent` still receives each changed order complete; keep the copy with the higher `version`. A new order now arrives with `version` 0 while it is still pending. Orders on symbols missing from the catalog are skipped, as order reads already do, instead of reaching `onError`. New optional callbacks: `onSnapshot` receives the account's full live view when the subscription starts and after a server resync, and it takes over snapshot orders from `onEvent`. `onRemoved` receives IDs of orders that left the live view, including, without `onSnapshot`, orders missing from a resync snapshot. `onStale` reports when that view is temporarily behind. Subscriptions to the same account share one server subscription, and one that joins later starts from the current live view; a connection carries up to 64 accounts. The stream resumes from its last cursor after a sequence gap, an expired token, a dropped heartbeat, or a reconnect, reporting each interruption through `onClose` and `onOpen` rather than `onError`. Reconnects back off from 0.5 to 10 seconds with jitter; close codes 4400 and 4403 end the stream instead.

Breaking: `orders.subscribe` throws `ValidationError` unless `accountId` is the account's base58 public ID. Custom `PolyesterRealtime` implementations passed as `realtimeClient` must add `connectPrivateOrders`.

Sync the public protobuf contract to `1b5658621d0ea5b356a69cc14402605ab72b5712`:

- Add the `privatews.v1` messages as `privateWsPb` in `@polyester/sdk/unstable/gen`, and the trade WebSocket batch create, replace, and cancel commands.
- `OrderErrorCode` gains the new order validation, capacity, auction, trigger, TWAP, ladder, batch, and Quick Swap codes. `TRIGGER_CANCEL_REJECTED` is removed: a refused trigger cancel now returns `TRIGGER_STATUS_INVALID` or `TRIGGER_NOT_MODIFIABLE`.
- Trigger `failureReason` labels add the new trigger failure reasons, each the lowercased reason name, such as `duplicate_order_id` and `market_quote_stale`.
- Withdraw errors add `AMOUNT_EXCEEDS_ROUTE_PRECISION`, returned before any funds are reserved when an external-chain `amount_e18` is finer than the destination token's decimals. Round the amount down before signing.
