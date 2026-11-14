# @polyester/sdk

## 0.36.0

### Minor Changes

- Breaking: `orders.batchReplace` resolves an item refused for its value, such as a price off the tick size or an invalid attached-risk price, as a rejected item in `results` with its `code` and `error`, instead of failing the whole batch. Resend only the corrected rejected items under a fresh `requestId`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Breaking: price alert status and the assistant `run_failed` failure category now spell canceled `"canceled"` (was `"cancelled"`), matching orders, triggers and the rest of the SDK. This covers `PriceAlert["status"]`, the `priceAlerts.list` `statuses` filter and `AssistantFailureCategory`. There are no aliases: `"cancelled"` is now rejected as an input. ([#254](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/254))

- Breaking: Lifecycle `zipperReason.code` is a label such as `"deposit_amount_below_minimum"` instead of a number, like every other enum. An uncataloged code reads `unknown_zipper_reason_${code}`. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- Breaking: a refusal caused by the API key's policy now reads `API_KEY_SPOT_TRADE_DENY` (no Spot Trading Write on the key) or `API_KEY_POLICY_REQUIRED` (no policy on the key) instead of `POLICY_SPOT_TRADE_DENY`, which now means only the sub-account's policy. All three still surface as `PermissionError`; handle them together. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Breaking: The order error code `MAX_QUOTE_DEBIT_TOO_SMALL` is renamed `QUOTE_SIZE_TOO_SMALL`, the refusal of either quote sizing, in `OrderErrorCode`, error details and `rejectReason`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Breaking: Trigger IDs are now opaque public IDs, like order IDs, and every existing trigger gets a new ID once: drop stored trigger IDs, list triggers again and restart trigger listings from the first page. A zero trigger ID is now rejected before it is sent. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Breaking: The trigger failure reason `max_quote_debit_too_small` is renamed `quote_size_too_small`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

### Patch Changes

- `apiKeys.setAssistantKeys` can bound a key with a permission `preset` (`read_only` or `trade_with_approval`) instead of a `policyId`. Available on devnet only. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `client.assistant.sendMessage` takes the `page` the user is on, named by route template and title. Available on devnet only. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `client.assistant.sendMessage` takes the `displaySettings` the client can change, and runs emit `display_setting_action` events asking the client to change one or show its choices. Available on devnet only. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `client.assistant.getTelegramApprovalLimits` and `setTelegramApprovalLimits` read and replace the per-approval and rolling 24-hour US dollar limits on what can be approved from Telegram. Available on devnet only. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `client.balances.exportStatement` returns one page of the account statement for a period as CSV: every balance movement with its fee and the balance after it. `exportStatementCsv` follows the pages and returns the whole statement. ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

- Changelog entries can carry the `assistant` surface, and `changelog.listChanges` can filter by it. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `client.changelog.listDeploymentGroups` and `getDeploymentGroup` read the deployments that brought releases to the environment, with their release posts, changes that need attention and highlights. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- Changelog release posts carry `releaseVersion`, the release's status in each environment (`environments`) and `deploymentGroupSlug`, and changes carry `environmentExceptions` where they differ from their release. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- Docs: the `trading_withdraw_request_fee` and `withdraw_failed` transfer types are the whole debit of a rejected or failed withdrawal, not a fee. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `client.marketData.listAssetInfo` reads team-maintained asset information: description, official links and launch date and price. ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

- `client.notifications` decodes `broker_allowlist_change` notices about QuickSwap broker vault payout address changes. These previously decoded as `"unspecified"`. Available on devnet only. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `client.notifications` lists, reads, counts and marks the caller's notifications with a session; API keys are refused. Available on devnet only. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Orders report the cancel reason `cancel_on_disconnect` when the trading WebSocket's cancel-on-disconnect canceled them, apart from `cancel_all_after`. These orders previously read `"unspecified"`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- GTC and GTD limit orders take `execution.displayQty` to show only that much on the book at a time (iceberg), below `qty` and at least `qty` divided by 100; orders report it as `displayQty` with the hidden part of `leavesQty` as `hiddenQty`. Refusals use the new codes `ICEBERG_NOT_ALLOWED`, `ICEBERG_DISPLAY_TOO_SMALL` and `ICEBERG_DISPLAY_INVALID`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- A SELL market or limit IOC order can be sized by `quoteProceeds`, the quote it sells for before fees, instead of `qty`; BUY, GTC, GTD, FOK, attached risk and a peg are rejected before sending. Create and batch create results and orders echo it as `submittedQuoteProceeds`, and the order's `cumQuote` is what it received. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Order intents, single and batch, take `peg: { reference: "best_bid" | "best_ask", offsetTicks? }` to take the limit price from the book at entry, offset by a signed count of the pair's tick size and bounded by `execution.price`. It needs `qty` sizing, a limit execution and no attached risk; refusals use the new codes `PEG_LIMIT_VIOLATION`, `PEG_REFERENCE_UNAVAILABLE` and `INVALID_PEG`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `selfTradePreventionMode` takes and reports `"decrement"`, which reduces both orders by the quantity that would have traded, also on orders with attached risk; an order left with nothing is canceled with the new cancel reason `stp_decrement`. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Order book subscriptions apply a delta only when it starts at the book's current sequence, and after a gap wait for the server's next reset instead of refetching snapshots. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `PolicyAction` adds `read-price-alerts` and `manage-price-alerts`, which API keys now need for `priceAlerts.list` and for `create`, `update` and `cancel`. Both are main-account permissions, so sub-account policies reject them, and like price alerts they are available on devnet only. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `PolicyAction` adds `read-statements` and sub-account permissions add `read_statements`, which API keys and members need to export account statements. ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

- Spot config pairs and the catalog add an optional `priceBand` (`lowerBps`, `upperBps`, `referenceWindowMs`), absent when the pair has no band, and orders report the cancel reason `price_band` when the band stopped a market order. Older snapshots without it still validate. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Sub-account activity events add the `requested` and `applied` actions: a requested change records a later `applied` or `failed` event. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `client.system.listStatusEvents` lists scheduled maintenance and incidents, with their affected services, markets and assets and their progress notes. ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

- Order error code `TRIGGER_ACTIVATION_PRICE_NOT_MODIFIABLE` rejects a trigger patch that sets a new activation price after a trailing stop started tracking. ([#255](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/255))

- `triggers.batchCancel({ triggerIds })` cancels 1 to 50 triggers in one request and answers each, in order, as `accepted` or `rejected` with a `code`. A `requestId` is generated when omitted; retry a timed-out batch with the same one. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Canceling a trigger that has already ended, including a repeated cancel, now throws with code `TRIGGER_STATUS_INVALID`, or `TRIGGER_NOT_FOUND` after 60 seconds, instead of returning the canceled trigger: treat either as done. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Triggers add `orderListId` and `clientListId`, set on both legs of an OCO, and `triggers.list` filters by either to read one OCO's legs. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `triggers.createOco` creates an OCO, a take-profit and a stop-loss that share one reserved quantity the account already holds and cancel each other, and returns its `orderListId` with both legs' trigger IDs. `triggers.cancelOco({ orderListId })` cancels both legs. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- `@polyester/sdk/unstable/gen` adds `assetInfoPb` (asset information). ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

- `@polyester/sdk/unstable/gen` adds `notificationsPb` (notifications, devnet only). `quickswapBrokerPb` adds the vault ledger and vault allowlist methods, and `quickswapPb` adds execution slices to execution progress. ([#251](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/251))

- Zipper chain variants carry `depositStatus` and `withdrawalStatus` (`normal` or `suspended`); treat `"unspecified"` or an absent value as not available. Older snapshots without them still validate. ([#256](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/256))

## 0.35.0

### Minor Changes

- Auto-withdraw rules now pause and resume instead of being disabled. `autoWithdraw.disableRule` is removed: call `autoWithdraw.setRuleEnabled({ expectedVersion, enabled: false })` to pause, which needs no step-up, and `enabled: true` with a fresh `stepUpToken` to resume. A paused version keeps its schedule and destinations, so it resumes to the same addresses; resuming checks every destination again and clears a pause the rule set itself. Treat a rule as running only while `enabled` is true and `pause` is null. Rules add `createdByAccountId`, the public account ID of whoever created the version. A stale `expectedVersion`, now sent as the withdraw code `VERSION_CONFLICT`, still throws `RevisionConflictError`. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- Breaking: order enum values are now lowercase everywhere, like the rest of the SDK and the Python, Rust and Go SDKs. `order.timeInForce` returns `"gtc" | "ioc" | "fok" | "gtd"` (was `"GTC" | "IOC" | "FOK" | "GTD"`), and `actionTaken` from `orders.modify`, `orders.batchReplace` and `orders.getBatchReplaceStatus` returns `"amended" | "replaced"` (was `"AMENDED" | "REPLACED"`). `orders.modify` and `orders.batchReplace` take `behavior: "amend_or_replace" | "amend_only" | "replace_only"`, and `orders.listHistory` takes `status: "filled" | "canceled" | "rejected"`. Uppercase inputs are now rejected. ([#245](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/245))

- Breaking: `realtime.isConnected` is removed. It was true whenever a socket object existed, even one that never connected. Read `realtime.connection` instead: `{ public, private }`, each `{ state, error }`, where `state` is `"connecting"`, `"connected"` or `"disconnected"` and `error` is the first failure of the current outage (a socket failure after a connection token failure replaces it), cleared once the socket connects. `realtime.onConnectionChange(listener)` calls the listener with the current value after each change, in a microtask, and returns an unsubscribe function. Private order streams run on their own socket and are not included. Custom `PolyesterRealtime` implementations must add both members. ([#232](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/232))

  A realtime socket that cannot connect now reports it. On the first failed attempt, every channel on that socket gets one `onError` with `type: "transport"` and a retryable `RealtimeError`, not one per reconnect retry; a channel subscribed while the socket is still failing gets it on subscribe. On the private socket, a failed connection token request is reported as `"connection_token"` on each attempt instead. The order book (whose snapshot waits for the channel to open) and trades no longer wait silently forever when the socket is unreachable; `onOpen` follows once it recovers.

  Once a channel's unsubscribe function has run, that consumer gets no further `onError` or `onUnsubscribed`, even from a notification already in progress (for example, unsubscribing from inside a terminal close's `onError` no longer also calls `onUnsubscribed`). Channels that actually closed are still told, even if a handler calls `disconnect()` meanwhile.

### Patch Changes

- `createApiKeyEd25519AuthHeaders` now builds the same canonical string as the server's API-key verifier, so requests with escaped or unusual URLs stop failing signature checks. It signs the upper-cased method and the percent-decoded path, sorts query pairs by their decoded bytes (key, then value), and escapes everything outside `A-Z a-z 0-9 - . _ ~`, keeping bytes that are not UTF-8. A URL with a `;` in its query or a malformed percent-escape now throws `ConfigurationError` before signing, because the server rejects those requests whatever the signature. The tests pin the signing vectors shared with the Go, Python and Rust SDKs. ([#238](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/238))

- `checkpoints.list` docs no longer say API keys are refused: an API key scoped to the main account whose policy grants `read-checkpoints` can call it. Each method that API keys can now call names the permission it needs in its docs: API keys, policies, profile, accounts, social verification, VIP status, deposit addresses, withdraw validation, Guard Signer status and the sub-account reads. ([#250](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/250))

- API keys add `purpose`: `"standard"` for keys the account holder made, `"assistant"` for keys made for the Polyester AI assistant, whose policy can never move value out of the account, or `"unspecified"` from older servers. Assistant keys are listed, updated and revoked like any other key. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- The API-key `recvWindow` docs now give the backend default of 5000 ms, down from 10000. The backend also refuses timestamps more than 1000 ms ahead of its clock, so keep the client clock synchronized. Signing is unchanged: HTTP requests never sent `X-API-NONCE`. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- API-key auth takes an optional `recvWindow`: a whole number of milliseconds from 1 to 60000, sent as `X-API-RECV-WINDOW` and signed on the line after the timestamp. The backend processes a request only until its timestamp plus the window, which defaults to 10000 when omitted. A value outside the range throws `ConfigurationError` before the request is sent. An `AUTH_RECV_WINDOW_INVALID` refusal maps to a non-retryable `ValidationError` rather than `AuthenticationError`, because the credentials are not at fault. ([#237](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/237))

- `apiKeys` adds `setAssistantKeys`, `listAssistantKeys` and `deleteAssistantKeys`. Available on devnet only. ([#248](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/248))

- Asset configs from `marketData.getSpotConfig` and the catalog add `includedInEquity`. When it is `false`, balances of the asset are still reported but count for nothing in total equity. An absent value, from older servers or snapshots, means unknown, so it is never defaulted to `false`. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `client.assistant` wraps the Polyester AI assistant: send messages, stream runs with `watchRun`, decide approvals, and manage conversations, memories and assistant keys. Available on devnet only. ([#248](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/248))

- Auto-withdraw destinations add `minFloor`, the least one payout can pay now (the route minimum, above its current network fee). A new rule's `minAmount` must be at least the floor, and it is null when the route or fee is unknown: show no floor then, not zero. Run steps add `networkFee`, the fee charged on the withdrawal, which is null until the step is final. Steps and previews can report `destination_cooling_down` for a broker vault destination whitelisted less than 24 hours ago. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `autoWithdraw.previewRun({ account })` shows what the next run would pay from the balances, prices and fees now: `status` (`will_pay`, `rolls_over`, `no_destination`, `paused` or `no_rule`), `nextRunAt`, `ruleVersion`, the self-set `pause`, `minUsdValue`, `computedAt`, and one entry per asset with `available`, `payable`, `heldBack`, `holdReason`, `minimum`, `valueUsd` with `pricedAt`, `networkFee` with `networkFeeSampledAt`, and `payableFrom`. Amounts are decimal strings and times epoch milliseconds. Unknown values are null, never zero, and an asset the rule pays nowhere has a null destination. The preview can change before `nextRunAt`. API keys with `read-auto-withdraw` can read it. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- The `orders.batchCreate` JSDoc now gives the batch's 15-minute idempotency window. It previously said 60 seconds, which is the `batchReplace` window. Within 15 minutes, a retry with the same `requestId` and payload returns each decided item's original result and retries the unresolved ones. After that the ID is free, and a repeat can place its orders again. ([#235](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/235))

- `orders.batchReplace` now accepts a `newPrice` or `newQty` change together with `clearRisk: true` in the same item, matching `orders.modify`. Previously the SDK rejected the combination before sending it. ([#243](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/243))

- The `orders.batchReplace` JSDoc now explains back-to-back refreshes. The receipt answers admission, before each admitted change completes, so the next refresh of the same order can be rejected with the retryable item code `ORDER_MODIFY_IN_PROGRESS`, or `ORDER_PLACEMENT_PENDING` when it names the returned `replacementOrderId`. Resend only those items in a new batch under a fresh `requestId` after a short jittered backoff. Never resend admitted items, and never resend a batch whose outcome you did not receive under a new `requestId`. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- The `orders.getBatchReplaceStatus` JSDoc now gives the 60-second status window. The status is readable as soon as `batchReplace` returns. Retry a `ServiceUnavailableError` with the same request within the window. A `ResourceNotFoundError` never means the replacement was rejected: reconcile the individual orders and never resubmit an accepted batch. An item's `updatedTsNs` can be a later recovery time, so it does not identify a refusal. ([#236](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/236))

- Changelog post summaries add `revision` and `updatedAt`. A post can now be republished to correct its copy or withdraw a change: `revision` starts at 1 and increases with each republication, and `updatedAt` is when the current revision was published. To follow edits, read a post again when its `revision` changes. `listChanges` restarts paging at the first change of a post republished during the walk, so deduplicate changes by `id`. ([#236](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/236))

- `Checkpoint` now carries `openingValueUsd`, the season-end USD value of the holdings restored when the season opened (`"0"` when it opened with no balances, `undefined` when a restored balance had no USD value). With it, `seasonResultUsd` reconciles as `finalValueUsd - openingValueUsd - netInflowUsd`. ([#235](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/235))

- A daily claim whose payout was submitted but not confirmed maps to the new `ClaimOutcomeUnknownError` (code `"CLAIM_OUTCOME_UNKNOWN"`, retryable), which carries the claim's `claimId`. Before, `claims.claimDailyReward` answered with a timeout in this case. Show the claim as pending, not failed: it is never paid twice, so poll `claims.getDailyClaimStatus` until its `claimId` is `claimed`, or call `claimDailyReward` again. Both calls now also accept an API key scoped to the main account whose policy grants `read-daily-claims` or `claim-daily-reward`. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- `expandColumnarTimestampsSec` and `columnarTimestampSecAt` now end at `endTsSec`, so the last columnar history point is no longer one bucket early. ([#233](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/233))

- If the connection drops while the SDK is reading a successful response body, the SDK now raises a retryable `NetworkError`. Before, it raised a non-retryable `InternalServerError` with the message "Failed to fetch". The SDK now handles the browser fetch messages "Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed" and "network error" the same way. Other `Unknown` errors map as before. ([#241](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/241))

- `formatLedgerBalance` is now exported from the package root. It converts a `ledger.read.v1.AssetBalance` message to the `LedgerBalance` that `balances.list` returns. Its U128 amounts are always at the 18-decimal ledger scale, whatever the asset's own decimals, so callers holding these messages from other APIs no longer convert them by hand. ([#239](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/239))

- `internalTransfers.get({ requestId } | { transferId })` reads an accepted transfer of the resolved source account and returns `requestId`, `transferId`, `flowId`, `acceptedAtUnixMs` and the exact `acceptedAtNs` as a decimal string. `internalTransfers.create` results also carry `flowId`. Use them to reconcile a transfer without resubmitting it, and pass `flowId` to `lifecycle.getFlow`. Pass exactly one identifier. An unknown, pending or inaccessible transfer is a `ResourceNotFoundError`. The read needs a session JWT; API keys are refused. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- `internalTransfers.create()` results now carry `status`: `"accepted"`, `"rejected"`, `"failed"`, or `"unspecified"` for a value this SDK version doesn't know. The response field was previously dropped. Rejected and failed transfers, such as insufficient funds or a missing step-up, still raise errors rather than returning a result. ([#239](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/239))

- Ledger transfer types add `trading_withdraw_fee_leg`, `quickswap_polyester_fee`, `quickswap_broker_fee`, `quickswap_affiliate_fee`, `fee_sweep`, `fee_refill` and `system_adjustment`, in `transfers.list` rows and filters, `transfers.subscribe` and order transfer legs. These rows previously decoded as `"unspecified"`. A `system_adjustment` can be a seeding credit or a correction that debits the account, so read `isDebit` for its direction rather than counting it as a credit. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- Ledger transfer types add `withdraw_failed`, funds that left the account for a withdrawal that was rejected or failed to execute, in `transfers.list` rows and filters, `transfers.subscribe` and order transfer legs. These rows previously decoded as `"unspecified"`. The withdrawal fee is not refunded. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `lifecycle.listFlows` with an `accountSelector` now also returns the transfers the account received from other accounts, such as transfers from other users or subaccounts and reward payouts. Each row carries `participation`: `"owner"` for a flow the account owns, including a transfer it sent, and `"recipient"` for a received transfer. Rows are `"unspecified"` without an account selector and in flow detail and realtime updates. Pass `participation: "owner"` to keep the previous owner-only list or `"recipient"` for received transfers only. `participation` requires `accountSelector` and throws `ValidationError` without one. A `pageToken` now resumes only the request it came from, so change nothing but `limit` between pages. ([#237](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/237))

- Lifecycle steps add `refundAddress`, the Polyester Chain smart account a rejected withdrawal's zTokens were returned to. It is set only on a withdrawal's `refunded` step and is `""` otherwise. Request fees add the status `"kept"`, a fee charged although the request did not complete, and lifecycle reasons add `zipper_compliance_transferred`, a deposit whose funds were moved out by compliance, which is not a refund. `tradingWithdraws.getWalletBalances({ account })` reads the zTokens that wallet holds, with `amount` as a decimal string, so you can offer to move a refund back. API keys need `read-balances`. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `orders.listOpen()`, `orders.listHistory()` and `transfers.list()` reject a `limit` that isn't an integer from 1 to 1000 with a `ValidationError`. A negative or fractional limit previously failed while encoding a binary request and surfaced as `InternalServerError`. ([#242](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/242))

- `auth.login()` and `auth.refreshSession()` results now carry `session`, the issued token's assurance details (`sessionId`, `sessionLevel`, `authenticationMethods`, `authTimeMs`) in the same shape as `auth.me().session`. The wallet login response sent them, but the SDK dropped them. `session` is `undefined` when the response omits it. ([#239](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/239))

- `auth.me()` now returns `rootSmartAccountAddress`, the caller's root smart-account address as lowercase `0x` hex, or `""` when the account has none. It was previously dropped. A new account can read `""` for a moment right after its first login, until the backend records the address. ([#239](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/239))

- `PolicyAction` adds thirteen account permissions for API-key policies: `read-api-keys`, `read-api-policies`, `read-subaccount-policies`, `read-subaccount-permissions`, `read-vip-status`, `read-social-verification`, `read-profile`, `read-account-directory`, `read-withdraw-validation`, `read-daily-claims`, `claim-daily-reward`, `read-checkpoints` and `read-rewards`. Each grants exactly the calls it names, so an API key can now list API keys and policies, read sub-account permissions, VIP status, social verification, profile, checkpoints and reward awards, resolve accounts, validate withdraw destinations, and read or claim the daily reward. Permissions for main-account data apply only to a key scoped to the main account. A sub-account policy refuses account permissions, so `subaccounts.policies.create` and `update` now reject them with `ValidationError` before sending. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- `PolicyAction` adds seven account permissions for API-key policies: `create-deposit-address`, `read-deposit-addresses`, `read-subaccounts`, `read-subaccount-activity`, `read-subaccount-members`, `read-subaccount-invites` and `read-guard-signer-status`. API keys now need them for the deposit-address, sub-account and Guard Signer reads, so add them to existing key policies that use those calls. A sub-account policy refuses them, so `subaccounts.policies.create` and `update` reject them with `ValidationError` before sending. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `client.priceAlerts` creates, lists, updates and cancels price alerts. Available on devnet only. ([#248](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/248))

- Bound the private order stream's memory: frames over 4 MiB are dropped undecoded and the connection reconnects, and a snapshot staging more than 100,000 orders or 64 MiB ends its subscription with a `snapshot` error. ([#246](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/246))

- `quickswapBrokerPb` in `@polyester/sdk/unstable/gen` adds `listVaultBalances`, which pages a broker's vault balances, with `VaultBalance` and `VaultAssetBalance`. The SDK has no QuickSwap broker client yet. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- Rate-limit details add the policy classes `assistant_message`, `assistant_control` and `assistant_read`. These previously decoded as `"unspecified"`. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- A ConnectRPC `resource_exhausted` that carries a `RateLimitDetail`, as wallet sign-in and the public catalog calls now send, maps to a `RateLimitError` with `rateLimit` set and `retryAfterMs` taken from the detail. Its `detail` is `{ service: "rate_limit", code: "RATE_LIMIT_EXCEEDED", rateLimit }`. The gateway's own refusal has no detail: `retryAfterMs` comes from `Retry-After` when present and is `undefined` for a concurrency refusal, so back off without a server hint. ([#236](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/236))

- Unsubscribing from a private channel, or from `connectPrivateOrders()`, in the same tick as subscribing without credentials no longer delivers the queued missing-authentication error to that consumer's `onError`. ([#242](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/242))

- Realtime token requests (`/v1/rt/token` and `/v1/rt/subscribe`) now go through the `fetch` passed to `PolyesterClient`, like every other SDK request. They used the global `fetch` before, so proxies, mocks and request logging never saw them. `RealtimeClient` takes the same optional `fetch`. Without one, both keep using the global `fetch`. ([#238](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/238))

- Realtime token requests honor `Retry-After`. When the connection or subscription token endpoint answers 429 with a `Retry-After` header, the `RateLimitError` carries it as `retryAfterMs`, and the realtime client sends no further token request until it has passed (at most 60 seconds), even when the socket retries sooner. This covers public, private and private order stream sockets. ([#232](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/232))

- A signed request refused with `AUTH_REPLAY_CAPACITY_EXHAUSTED` maps to a retryable `RateLimitError` without `retryAfterMs`. Before, a full replay store answered `SIGNATURE_INVALID`. Now each API key and account holds a fixed share, so only the key or account at its share is refused. Back off briefly and retry, which signs again. A shorter `recvWindow` frees room sooner. ([#237](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/237))

- An order or trigger write refused with `REQUEST_DEADLINE_EXCEEDED` maps to the new `RequestDeadlineExceededError` (code `"REQUEST_DEADLINE_EXCEEDED"`, retryable), a subclass of `TimestampSkewError`. The signed request passed authentication, but its receive window ended before admission. Nothing changed, and this is never an unknown outcome, so retrying, which signs again with a fresh timestamp, is safe. Every signed request now has this deadline, including requests sent without `recvWindow`, which get the 10-second default. ([#237](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/237))

- An HTTP 413 now maps to the new `RequestTooLargeError` (code `"REQUEST_TOO_LARGE"`, not retryable) instead of a plain `RequestError`. Every service now refuses an oversized body with the same 413 problem, including ledger reads and API-key authentication of ConnectRPC calls. Send a smaller request; the size limit does not change. A ConnectRPC message over the limit still arrives as `resource_exhausted` and maps as before. ([#236](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/236))

- `rewards.acknowledgeAward({ awardId, revealed, deliverySeen })` records that the recipient revealed an award or saw a paid award's delivery, and reward awards add `revealedAt` and `deliverySeenAt`, absent until acknowledged. The marks are shared across sessions and devices, so gate reveal and delivery dialogs on them instead of per-device storage. Set at least one mark; `awardId` must be a UUID. Marks are independent, permanent and idempotent, so a failed call can be retried as is. `deliverySeen` on an award that is not paid fails the whole call with `PreconditionFailedError`. A fresh `listAwards` shows acknowledgements from other sessions even when `awardsMayChange` is false. `listAwards` now also accepts an API key scoped to the main account whose policy grants `read-rewards`. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

- `rewards.listAwards` now returns `awardsMayChange`. It is `true` while a campaign can still publish awards or one of the account's awards is awaiting a destination, ready for payout, or failed and retryable. When it is `false`, polling cannot return new awards or award changes until a new campaign is created. ([#235](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/235))

- `PolyesterErrorCode` now includes `"SUBACCOUNT_CHALLENGE_INVALID"`, the code `SubaccountChallengeInvalidError` already carries, so an exhaustive `switch` over the union covers it. ([#235](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/235))

- `Subaccount` records now carry `removed`. `subaccounts.subscribe` emits `removed: true` (with `role: "unspecified"`) when the caller loses access to a subaccount, for example after the owner removes them as a member, so drop it from local state. List and get responses always return `false`. Access and role changes do not bump `revision` or `updatedAt`, so apply them in arrival order. ([#235](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/235))

- `client.system.getVersion()` returns the version, commit and environment the API serves. ([#248](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/248))

- Social verification links Telegram accounts. `socialVerification.start({ provider: "telegram" })` returns an `actionUrl` that opens the Polyester bot with the code. Poll `get` until the status is `"awaiting_confirmation"`, show the account's `handle`, `displayName` and `providerUserId`, then call `confirm({ provider: "telegram", providerUserId })` with a fresh `stepUpToken` to link exactly that account. `unlink({ provider: "telegram" })` removes the link or cancels one in progress. `providerUserId` stays a decimal string. Telegram does not use `markReady`, and starting again while an account is linked fails until it is unlinked. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- `tradeWsPb` in `@polyester/sdk/unstable/gen` adds the `cancelAllAfter` client command and acknowledgement, which arm, refresh or disarm the account's dead-man switch, plus the `ClientFrame` fields `timestampMs` and `recvWindowMs`, which set a per-command receive window. The SDK has no trading WebSocket client yet. ([#237](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/237))

- `Trigger.configuration` now includes `triggerPriceSource` for stop loss, take profit and trailing stop triggers, so `triggers.get` and `triggers.list` return the price source set at create. ([#244](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/244))

- `triggers.create()` validation errors name the field missing from the trigger type you chose, e.g. `durationMs` for a TWAP or `triggerPrice` for a take-profit. They previously said `triggerType: Expected "stop_loss"` for every type except stop-loss. An unknown `triggerType` now says which values are allowed. ([#242](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/242))

- `triggers.modify()` accepts `maxSlippage: { kind: "bps", bps: 10000 }`, which a buy stop-loss or take-profit with a market child allows. It previously rejected anything above 9999 locally. The server still rejects 10000 for a sell stop-loss or take-profit and for trailing stops, with `ERROR_CODE_MAX_SLIPPAGE_INVALID`. ([#242](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/242))

- `triggers.fromProto(trigger)` converts a `triggers.v1.Trigger` message received from another API into the same `Trigger` record that `triggers.get`, `list`, and `subscribe` return, with quantities and prices scaled by the client's catalog. It waits for the catalog and throws when the trigger's market isn't in it. ([#239](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/239))

- `@polyester/sdk/unstable/gen` adds `assistantPb` (the AI assistant), `priceAlertsPb` (price alerts), `systemPb` (`getVersion`) and `quickswapReferralPb` (QuickSwap referrals). `quickswapBrokerPb` adds broker payouts and vault payout rules, and `apiKeysPb` adds the assistant key methods. The assistant, price alerts and assistant keys are available on devnet only. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- A wallet login refused with `AUTH_WALLET_ALREADY_LINKED` maps to a non-retryable `AlreadyExistsError`. The wallet already belongs to another account, so the same login fails again. Log in with the account address the wallet already uses. ([#236](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/236))

- Withdraw error details now carry `fieldPath` (the request field refused, such as `destinations[0].min_amount_e18`), `minFloor` (a decimal string, with `MIN_AMOUNT_BELOW_FLOOR`) and `payableFrom` (epoch milliseconds), each only when the server sends it. Map auto-withdraw refusals to form fields with `fieldPath`. The new codes `DESTINATION_INVALID`, `MIN_AMOUNT_BELOW_FLOOR`, `ROUTE_UNSUPPORTED` and `VERSION_CONFLICT` replace `INVALID_DESTINATION_ADDRESS`, `AMOUNT_BELOW_MINIMUM`, `UNSUPPORTED_ASSET` or `INVALID_DESTINATION_CHAIN`, and `CONFLICT` on rule writes. Treat `EXTERNAL_DESTINATION_COOLING_DOWN` as retryable after `payableFrom`, not as a whitelist error: the destination is listed. ([#247](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/247))

- Chain configs from `zipper.getDepositWithdrawConfig` and the catalog add `memoRequirement` (`"required"`, `"optional"`, `"not_supported"` or `"unspecified"`), `memoLabel` (such as `"Destination tag"`) and `memoFormatHint`. The requirement covers withdrawal destinations and QuickSwap destination, return and refund targets, not deposit instructions. Use it as the rule and the label and hint for display only, without parsing the hint. Treat `"unspecified"`, or a value absent from an older catalog snapshot, as unknown: never assume the memo can be omitted. ([#240](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/240))

## 0.34.0

### Minor Changes

- **Breaking:** every SDK label, key and filter value now uses the `canceled` spelling. Trigger status (output and the `triggers.list` `status` filter), sub-account invite status and social-verification status change from `"cancelled"` to `"canceled"`, matching order status and trigger events. The `orders.cancelAll` result renames `cancelledOrders` to `canceledOrders` and `totalCancelled` to `totalCanceled`. There are no aliases: update any code that compares against `"cancelled"` or reads the old keys. ([#230](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/230))

### Patch Changes

- Order, trade, market trade, balance and candle streams (and their list reads) no longer re-validate protobuf-decoded messages with Valibot before formatting them. Payloads are unchanged; per-message formatting is roughly 1.5-2.5x faster. ([#231](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/231))

- `ValidationError` messages name the field that failed. When an input matches none of the shapes a method accepts, the message now comes from the closest shape and is prefixed with its path, such as `items.0.symbolId: Invalid key: Expected "symbolId" but received undefined` for `orders.batchCreate` with `symbolId` on the request instead of each item. Before, this was the generic `Invalid type: Expected Object but received Object`. The same applies to an unsupported `execution.clientRefPrice` on `orders.create`, and `triggers.create` now reports `sliceIntervalMs cannot exceed durationMs` for a TWAP. Messages that already name their field are unchanged. ([#228](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/228))

## 0.33.0

### Minor Changes

- Breaking: the holds list is removed. `ledgerReadPb` in `@polyester/sdk/unstable/gen` drops `LedgerReadService.ListHolds`, `ListHoldsRequest`, `ListHoldsResponse` and `HoldRow`. Read held amounts from each asset's `reserved` amount in `balances.list`. ([#225](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/225))

- `trades.list` takes `symbolId` as a number, like every other symbol filter and like the `symbolId` on returned trades, orders and triggers. A string, `0`, negative or fractional `symbolId` is rejected. "symbolId is required when afterMatchId is set" now appears only when `afterMatchId` is set without `symbolId`. ([#226](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/226))

### Patch Changes

- API key refusals on ConnectRPC now carry an auth `detail.code` that names the reason: `AUTH_SIGNATURE_INVALID`, `AUTH_TIMESTAMP_SKEW`, `AUTH_MISSING_HEADERS`, `AUTH_KEY_EXPIRED`, `AUTH_KEY_DISABLED`, `AUTH_IP_NOT_ALLOWED` or `AUTH_API_KEY_NOT_ACCEPTED`. `AUTH_TIMESTAMP_SKEW` still maps to the retryable `TimestampSkewError`, and a retry signs the request again. ([#223](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/223))

- Attached take-profit, stop-loss and trailing stop exits never trade with the order they protect. Order `cancelReason` adds `attached_exit_fired`: the exit fired while the order still rested, so its unfilled remainder was canceled first. Fills before the cancel stand. Trigger failure reasons add `self_trade_prevented`, reported only as a `"fire_refused"` event's `fireRefusalReason`: self-trade prevention expired the exit's order against another of the account's resting orders, and the trigger stays live and fires again. That event's `childSeq` names the expired child order. ([#224](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/224))

- An order's `attachedRisk.trailingStop` now carries `limitPrice`, the most its buy-back pays per unit, set when the order sells and `undefined` when it buys. Previously it was dropped, so a selling order's trailing stop read back and passed to `modifyOrder` lost its limit price and was rejected with a bad-price error. ([#227](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/227))

- Add `autoWithdraw`, which manages an account's scheduled auto-withdraw rule: `getRule`, `setRule`, `disableRule` and `listRuns`. `setRule` and `disableRule` need a fresh `stepUpToken`, and a stale `expectedVersion` throws `RevisionConflictError`. ([#222](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/222))

- Changelog surfaces add `market_data`, `quickswap` and `rewards`, for output and for `listChanges` filters. Each post section has a `surface`, the product area it covers, or `"unspecified"` when it covers more than one. ([#223](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/223))

- Order and trigger `cancelReason` add `market_halted`: the exchange halted the market and canceled every open order and trigger of it, attached take-profit and stop-loss included, and released their reserved funds. Fills before the cancel stand, and the market refuses new orders until it trades again. Show it as "market halted", not as a user cancel. ([#221](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/221))

- Orders carry their exact execution totals. `avgPx` is now the exact average execution price, up to 18 decimal places instead of rounded down to 9. `cumQuote` is the quote amount the fills used before fees, `"0"` with no fills. `feeTotal` (`{ amount, isRebate, qty }`) is the net fee in the order's `feeAsset`: order history and `getDetails` include it, open orders leave it out. It covers every fill once `feeTotal.qty` equals `cumQty`. ([#223](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/223))

- Add `changelog`, a public reader for the environment's product changelog: `listPosts`, `getPost({ slug })` and `listChanges`, which filters changes by category, audience, surface and time. The generated protobufs are exported as `changelogPb`. ([#218](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/218))

- `fees.getSpotRates` rows add `reserveFeeRatePercent` and `postOnlyReserveFeeRatePercent`, the rates a new order reserves its quote-asset fee at: the highest rate of any VIP tier on the market, so at least the effective rates. Size buy orders by the reserve rate, not the effective one. `breakdown` lists the components of the effective rates: the VIP tier rates, an optional `marketMultiplier`, `accountDiscounts` (`[]` when none) and an optional `referralDiscount`, with `effectiveFrom` and `effectiveTo` in Unix milliseconds. `nextChangeAt` is when a component next starts or ends, or `undefined` when no change is scheduled. ([#225](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/225))

- `subaccounts.get` accepts `includeBalances: true` and then returns the sub-account's current `balances`, in the shape of `balances.list`. It needs the read-balances action on the sub-account or fails with PermissionDenied. When balances cannot be read right now it fails with the retryable `AUTH_TEMPORARILY_UNAVAILABLE`. Without `includeBalances`, `get` is unchanged and returns no `balances`. ([#224](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/224))

- Trigger events add the `"fire_refused"` event type: a fire was refused and the trigger stayed live, so it is not terminal. The event's `fireRefusalReason` says why, using the trigger failure reason labels. `listEvents` accepts `eventType: "fire_refused"` as a filter, and trigger failure reasons add `account_repairing`. ([#223](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/223))

## 0.32.1

### Patch Changes

- An order's attached `risk.trailingStop` takes `limitPrice`, the most its buy-back pays per unit. A selling order's attached trailing stop buys back, and the API now rejects it without this price, so `limitPrice` is required when the order sells and must be omitted when it buys; the SDK rejects either mismatch with `ValidationError` before sending. It must be at least `activationPrice` when both are set. `orders.modify` and batch replace pass it through; the API checks it against the order's side. ([#216](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/216))

## 0.32.0

### Minor Changes

- Add a `timeoutMs` request option, passed to Connect as the call deadline, so timed-out requests reject with `TimeoutError`. It must be a positive integer of at most 2147483647; other values throw `ValidationError`. `AbortSignal.timeout()` expiries also map to `TimeoutError`, whether the signal comes from the caller or an interceptor; previously they rejected as an abort or as a `ConnectError` with `Code.Canceled`. A caller signal that already expired before the call started still rejects as a non-retryable abort, so retry loops stop instead of spinning on it. `isTimeoutAbortError` is exported alongside `isAbortError`. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

- Trailing-stop triggers can buy. Pass `side: "buy"` with a `limitPrice`, the most the child pays. It must be at least `activationPrice` when that is set. A sell trailing stop is still the default and rejects `limitPrice`. Trigger configurations decode `limitPrice` for a buy trailing stop. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `orders.cancelAllAfter` returns the armed switch's `effectiveScope`: `{ accountId, symbolId, side }`, where an unset `symbolId` or `side` covers all of them. It is absent while the switch is disabled. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `orders.cancelAll` returns `listingStatus`. A retry with the same `requestId` returns `"not_retained_read_open_orders"` with an empty `cancelledOrders`, which does not mean nothing was canceled; read open orders instead. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `orders.cancelAll` returns `cancelledOrders`: up to 200 `{ orderId, clientOrderId }` entries, oldest first. It also returns `totalCancelled`, and `truncated` when not every canceled order is listed. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Candle timeframes add `3m`, `2h`, `6h`, `8h` and `3d`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Checkpoint asset amounts add `excludedFromValue`. When it is true, the asset is not account equity (for example a testnet faucet token): it is listed by amount only, `usd` is always absent, and it counts toward no USD total. A missing `usd` on such an asset is not a pricing gap. A response that gives such an asset a `usd` value is rejected with `ValidationError`. ([#210](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/210))

- Daily claims add the `payout_delayed` state and `payoutDelayReason`, a claims error code name such as `CLAIM_PAYOUT_UNAVAILABLE`. Claims errors add `CLAIM_PAYOUT_UNAVAILABLE`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `claims.claimDailyReward` takes an input object before the request options, so `claimDailyReward({ subaccountId })` pays the daily reward to a subaccount owned by the authenticated root account. Omit `subaccountId` to pay the root account as before. Breaking: pass request options as the second argument, as in `claimDailyReward({}, { signal })`; options passed first now throw `ValidationError`. A `subaccountId` that decodes to zero also throws `ValidationError` instead of silently paying the root account. The first claim of the day fixes the destination, and retries return that claim and its destination. `DailyClaimStatus` and `ClaimDailyRewardResult` add `subaccountId`, which is `undefined` when the reward goes to the root account. Claims errors add `SUBACCOUNT_NOT_FOUND` and `SUBACCOUNT_INACTIVE`. ([#202](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/202))

- Stop-loss, take-profit and trailing-stop triggers, and the attached `takeProfit`, `stopLoss` and `trailingStop` legs of an order, take `triggerPriceSource: "last" | "index"`. Omitted watches the last traded price as before. `"index"` watches the market's index price and waits while it is stale. Spot markets do not support `"mark"`, which the SDK rejects with `ValidationError`. Attached legs decode their `triggerPriceSource`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Lifecycle flows add `isDelayed` on summaries, `milestoneTxChainId` on steps and `txChainId` on step activities. The lifecycle reason adds `deposit_source_not_confirmed` and the lifecycle source adds `lifecycle`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Buy stop-loss and take-profit triggers accept a `market_ioc` child. A `market_ioc` child takes an optional `maxSlippage`: 1 to 10000 bps for a buy, 1 to 9999 for a sell. Without it, the pair's default market slippage applies. Trigger configurations decode the child's `maxSlippage`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `OrderErrorCode` adds `MAX_OPEN_ORDERS_PER_PAIR`, and trigger failure reasons add `max_open_orders_per_pair`. Order error details add `existingOrderId`: on a `CONFLICT_DUPLICATE_CLIENT_ORDER_ID` rejection, it is the ID of the order that already holds the client order ID, when that order is known. Batch create rejections carry it too. ([#210](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/210))

- Breaking: `triggers.modify` no longer takes `limitPrice`, because the backend rejects any change to a child's limit price. Cancel the trigger and create a new one instead. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `OrderErrorCode` gains the new order validation, capacity, auction, trigger, TWAP, ladder, batch, and Quick Swap codes. Breaking: `TRIGGER_CANCEL_REJECTED` is removed; a refused trigger cancel now returns `TRIGGER_STATUS_INVALID` or `TRIGGER_NOT_MODIFIABLE`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `orders.getDetails` returns `executionsComplete`. It is true once the trades across every page add up to the filled quantity; while it is false, read again for the rest. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Breaking: order reads drop `terminalReason` and `terminalReasonCode`. A rejected order carries `rejectReason`, the `OrderErrorCode` the Orders API returns for the same refusal, such as `"TWAP_CAPACITY_REACHED"`. A canceled order carries `cancelReason`, such as `"user_request"`, `"ioc_remainder"`, `"stp_expire_maker"`, `"replaced"`, `"gtd_expired"`, `"pair_drain"` (market disabled), `"cancel_all_after"` or `"twap_rollover"`. Both are omitted for every other status. A code newer than this build reads as `"UNSPECIFIED"` or `"unspecified"`: treat it as a generic refusal or cancel. On `orders.subscribe`, order updates drop `reasonCode`: read `rejectReason` for a rejected order and `cancelReason` for a canceled order or for the replaced update of the order a replace ended. `OrderErrorCode` adds `ATTACHED_LEGS_EXCEEDED`, `FEE_ASSET_INVALID`, `FEE_CEILING_INVALID`, `UNSUPPORTED_FIELD_SET`, `TRIGGER_FIRE_LIMIT_REACHED`, `CONDITION_FLAGS_INVALID`, `CONDITION_PARAMETER_SET`, `TWAP_CAPACITY_REACHED` and `CHILD_ORDER_INCONSISTENT`. ([#212](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/212))

- `orders.subscribe`'s `onStale` receives `orderIds` when only those orders are behind. Their rows show an earlier state while the rest of the view is current. A later call replaces the earlier one, and `onStale(false)` means every order is current again. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Breaking: every order and trigger outcome-unknown code (`ORDER_CREATE_OUTCOME_UNKNOWN`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `TRIGGER_CREATE_OUTCOME_UNKNOWN` and `TRIGGER_CONTROL_OUTCOME_UNKNOWN`) now throws the new non-retryable `OutcomeUnknownError` instead of a retryable `TimeoutError`. The change may already have applied, so read the order by its client order ID, or list triggers by client trigger ID, before sending it again. `detail.code` names the operation. A deadline without one of these details is still a retryable `TimeoutError`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Pair status adds `halted`: only cancellations are accepted. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Stream `orders.subscribe` over the private WebSocket (`/v1/ws/private`), since the realtime channels `private:spot:orders:<account>` (JSON and `:proto`) and `private:spot:orders:batch-replace:<account>` are no longer served. `onEvent` still receives each changed order complete; keep the copy with the higher `version`. A new order now arrives with `version` 0 while it is still pending. Orders on symbols missing from the catalog are skipped, as order reads already do, instead of reaching `onError`. New optional callbacks: `onSnapshot` receives the account's full live view when the subscription starts and after a server resync, and it takes over snapshot orders from `onEvent`. `onRemoved` receives IDs of orders that left the live view, including, without `onSnapshot`, orders missing from a resync snapshot. `onStale` reports when that view is temporarily behind. Subscriptions to the same account share one server subscription, and one that joins later starts from the current live view; a connection carries up to 64 accounts. The stream resumes from its last cursor after a sequence gap, an expired token, a dropped heartbeat, or a reconnect, reporting each interruption through `onClose` and `onOpen` rather than `onError`; token fetch failures along the way still reach `onError`. Reconnects back off from 0.5 to 10 seconds with jitter; close codes 4400 and 4403 end the stream instead. ([#203](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/203))

  Breaking: `orders.subscribe` throws `ValidationError` unless `accountId` is the account's base58 public ID. Custom `PolyesterRealtime` implementations passed as `realtimeClient` must add `connectPrivateOrders`.
- Add the `privatews.v1` messages as `privateWsPb` in `@polyester/sdk/unstable/gen`, and the trade WebSocket batch create, replace, and cancel commands. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Breaking: the whiteboard, layout and chart-layer APIs are no longer published. `client.whiteboard`, its types and the `@polyester/sdk/services/whiteboard` subpath are removed, as are the `whiteboardPb`, `layoutPb`, `polychartPb` and `polychartEventsPb` namespaces of `@polyester/sdk/unstable/gen`. The generated sub-account detail drops `includeBalances` and `balances`; read sub-account balances with the balances read and its sub-account filter. ([#212](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/212))

- Spot config pairs add `maxMarketNotionalQuote`, the largest notional of one market order as a decimal string in quote units. A buy is valued at its protection price and a sell at its reference price, before slippage; an order above it is rejected with `MAX_NOTIONAL`. It is absent when the pair has no maximum, so treat absence as no cap. Catalog snapshots carry it, and older snapshots without it still validate. `OVERLOADED` order errors now mean the account already has its maximum order requests in flight; they still surface as a retryable `RateLimitError` with no `retryAfterMs`, so retry after an outstanding request completes. ([#211](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/211))

- Spot config pairs add `maxLimitQtyBase`, `maxMarketQtyBase` and `maxOrderNotionalQuote`, decimal strings that are absent when the pair has no maximum, and `maxOpenOrdersPerPair`. `SpotConfig` adds `maxOpenOrdersTotal`. The open-order counts are the venue's defaults for a typical account; an account may have a lower limit of its own. Catalog snapshots carry these fields, and older snapshots without them still validate. ([#210](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/210))

- `marketData.listTrades` takes `afterTradeId` (a uint64 decimal string; start from `"0"`) to walk a symbol's trades oldest first with no gaps. The result then carries `backfill` with `completeThroughTradeId`, `nextAfterTradeId` and `epochEnds`. `afterTradeId` cannot be combined with `side`, `startTsNs`, `endTsNs` or `pageToken`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Trigger events decode the new `"armed"` event type: an attached take-profit, stop-loss or trailing-stop leg reports it once, when its parent order's first fill makes the leg live (or when a leg paused before that fill resumes). It is not terminal. `listEvents` also accepts `eventType: "armed"` as a filter. Attached trailing stops still report `"activated"` when they start tracking. ([#214](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/214))

- `triggers.modify` and `triggers.resume` no longer require `symbolId`. Omitted, it targets the trigger's own market; when set, it must be that market. An API key limited to specific markets must still pass it. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `sendPolyesterUserOperation` throws `UserOperationSendTimeoutError` (code `USER_OPERATION_SEND_TIMEOUT`, not retryable) when `eth_sendUserOperation` times out after signing. The bundler may still have accepted the operation, so the error carries its deterministic `userOpHash`: wait on it with `waitForPolyesterUserOperationReceipt` instead of signing again. Bundler requests now time out after 30s instead of viem's 10s default. ([#205](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/205))

- VIP status adds `settledVolumeQuality` and `averageAopQuality`, each `{ status, incompleteHours }` with status `complete`, `price_unavailable` or `incomplete_history`. With `price_unavailable`, `settledVolume30dUsd` is a lower bound. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

### Patch Changes

- Attached trailing stops now take 1 to 9999 bps `maxSlippage` on either side. The trailing stop of a sell order previously accepted 10000, which the backend now rejects. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `AUTH_TEMPORARILY_UNAVAILABLE` maps to a retryable `ServiceUnavailableError`. `OrderErrorCode` adds `TRIGGER_WOULD_TRIGGER_IMMEDIATELY`, `ORDER_CREATE_OUTCOME_UNKNOWN` and `TRIGGER_CREATE_OUTCOME_UNKNOWN`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Browser clients now confirm a backend session rejection with `me()` before ending the session, so one endpoint wrongly answering `unauthenticated` no longer signs the user out. When `me()` is also rejected, the session ends and `loggedOut` is emitted once. Concurrent rejections, including the confirming `me()` itself, share a single check. Rejections for a token that is no longer current (refreshed, replaced, or after logout), and requests sent without a token, are still ignored. `AccountSignerAuthService.handleRejectedToken` now returns a promise that settles when the check completes. ([#204](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/204))

- Errors mapped from failed responses now carry the HTTP `status`, including realtime token request failures. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

- Trigger `cancelReason` adds `account_repair` and, for a disabled market, `pair_drain_trigger`, `pair_drain_twap`, `pair_drain_ladder` and `pair_drain_attached_leg`. Show the drain reasons as "market disabled", not as a user cancel. `failureReason` adds `index_price_unavailable` and `trigger_would_trigger_immediately`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Trigger `failureReason` adds `child_order_inconsistent`. `OrderErrorCode` adds `CHILD_QTY_EXCEEDS_REMAINING`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `ORDER_REPAIRING`, `ACCOUNT_REPAIRING` and `QUICKSWAP_ACCOUNT_OWNER_UNKNOWN`. For either outcome-unknown code, read the order back before retrying. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `orderbook.get` returns `available`. When it is false the book is being built or was invalidated: its levels are unknown, not empty, so read it again later instead of showing no liquidity. Order book subscriptions no longer emit such a snapshot as an empty book: it reaches `onError` as a `ServiceUnavailableError` and is retried, and the first event arrives once the book is available. ([#212](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/212))

- Add `checkpoints.list({ subaccountId })`, which returns the signed-in account's testnet season checkpoints, newest first, and is empty when the account has none. It needs a session login; API keys are refused with `PERMISSION_DENIED`. A `subaccountId` reads its root account's checkpoints, and one that decodes to zero throws `ValidationError`. USD values are decimal strings and are `undefined`, not zero, when unavailable; `incomplete` lists the values computed from partial evidence. The generated protobufs are exported from `@polyester/sdk/unstable/gen` as `checkpointsPb`. ([#208](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/208))

- `tradingRateLimits.getConfig` and `vip.listTiers`, the public catalog reads, now use cacheable ConnectRPC GET. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- `@polyester/sdk/unstable/gen` adds `QuickSwapBrokerService.GetQuickSwap` and the new QuickSwap status reasons. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Decode market trade, user fill, ledger transfer, and trigger event subscriptions as the batched publications the realtime channels now send, and emit each event in order through the existing `onEvent`. Previously a batch decoded as a single event, dropping or zeroing the rest, or failed with a decode error. A malformed event is reported through `onError` without dropping the rest of its batch. `LedgerTransfer` adds `transferId`, an unsigned 128-bit decimal string shared by both legs of a transfer, and `TriggerEvent` adds the exact `tsNs`, so subscribers can replace repeated events by their identity. ([#195](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/195))

- Reject a 10000 bps max slippage on a market order or trailing stop that sells, which the backend rejects with `MAX_SLIPPAGE_INVALID`. Sell market orders, the attached trailing stop of a buy order, and standalone trailing-stop triggers, including `triggers.modify`, now accept 1 through 9999 bps; buy market orders and the attached trailing stop of a sell order still accept 10000. ([#195](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/195))

- Sync the protobufs for Swaps, auto-withdraw, and the QuickSwap broker API, exported from `@polyester/sdk/unstable/gen` as `swapPb`, `autoWithdrawPb`, and `quickswapBrokerPb`. The SDK does not wire these services yet. Policy actions add `read-auto-withdraw`, `manage-auto-withdraw`, and `swap`, and sub-account permissions add `read_auto_withdraw`, `manage_auto_withdraw`, and `swap`, so policies and roles that grant them decode with their labels instead of as unknown. Order errors add `ERROR_CODE_MAX_QTY` and `ERROR_CODE_MAX_NOTIONAL`, and withdraw errors add `ERROR_CODE_INVALID_AUTO_WITHDRAW_SCHEDULE`. ([#200](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/200))

- `tradingRateLimits.getConfig` and `vip.listTiers` use cacheable ConnectRPC GET on testnet too. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Trigger `failureReason` labels add the new trigger failure reasons, each the lowercased reason name, such as `duplicate_order_id` and `market_quote_stale`. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Decode the `SELF_TRADE_PREVENTION` trigger cancel reason as `cancelReason: "self_trade_prevention"` instead of `"unspecified"`. Triggers report it when self-trade prevention canceled their child orders. ([#195](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/195))

- Triggers return `version`: 1 for a trigger's first state, higher for every later change. Across `triggers.get`, `triggers.list` and `triggers.subscribe`, keep the copy with the highest version and ignore copies whose version is not higher than the one you hold, since a reconnect can repeat an earlier state. ([#212](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/212))

- Uint64 decimal filters such as `startTsNs` now reject values above 18446744073709551615 with `ValidationError` instead of failing to encode. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

- Fix raw `ConnectError`s surfacing as unhandled promise rejections when the backend or a proxy returns a non-Connect response (for example a gateway 502, a redirect, or an HTML page with status 200). The SDK now buffers those response bodies before Connect aborts the request. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

- `sendPolyesterUserOperation` throws `UserOperationAlreadyKnownError` (code `USER_OPERATION_ALREADY_KNOWN`, an `AlreadyExistsError` subclass) when the bundler answers "Already known", meaning the identical operation is already pending. Its `userOpHash` is that pending operation's hash: wait on its receipt instead of signing again. Previously this surfaced as a raw viem RPC error. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

- `waitForPolyesterUserOperationReceipt` throws `UserOperationNotExecutedError` (code `USER_OPERATION_NOT_EXECUTED`) instead of a plain `Error` when the bundler reports the operation `rejected` or `failed`. It carries `userOpHash` and `bundlerStatus`; either status means the operation was not executed and nothing moved. Both new UserOperation errors are exported from the root, `@polyester/sdk/errors`, and `@polyester/sdk/smart-account`. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

- `PreparedTradingWithdraw.submit` throws `WithdrawDeadlineExpiredError` once the deadline has passed instead of sending a request the backend would reject. The backend's `deadline_ts_sec has expired` rejection also maps to `WithdrawDeadlineExpiredError`, a `ValidationError` subclass, instead of a generic `ValidationError`. ([#190](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/190))

  Trading withdraw inputs accept an optional `deadline` to sign a different expiry.

  Wallet-signed withdraws sign a fresh deadline and nonce, with the same idempotency key, when `submit` is called within a minute of the deadline, so a retry after a slow MFA step-up just works; `deadline` then reflects the new signature. Payload-signed withdraws can't be signed again: prepare them again before resubmitting.
- Withdraw errors add `AMOUNT_EXCEEDS_ROUTE_PRECISION`, returned before any funds are reserved when an external-chain `amount_e18` is finer than the destination token's decimals. Round the amount down before signing. ([#209](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/209))

## 0.31.0

### Minor Changes

- Realtime `onError` contexts now always carry an `Error`. Server and websocket failures arrive as the new `RealtimeError` (code `REALTIME_ERROR`) with the Centrifugo code on `realtimeCode`, instead of plain `{ code, message }` objects. `retryable` is true for errors the realtime client is already retrying on its own, such as code 109 (token expired), so callers can skip reporting them. Snapshot failures keep their original typed SDK error. ([#193](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/193))

  Browser clients end the session and emit `loggedOut` when an authenticated RPC is rejected as unauthenticated with the current token, for example when the backend revoked it or the device clock lags. Rejections of a token that has since been replaced, and those arriving while a login or refresh is in flight, are ignored. `AccountSignerAuthService.handleRejectedToken` exposes the same check.

  `PreparedTradingWithdraw` exposes the signed `deadline` and `isExpired()`, which turns true a minute before the deadline. Prepare again before resubmitting an expired withdraw, for example after a slow MFA enrollment.

## 0.30.2

### Patch Changes

- `patchZipperCatalogSupply` caches the snapshot it returns as already validated, so passing it to `catalog.setSnapshot` no longer re-validates the whole catalog on every supply update. ([#191](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/191))

## 0.30.1

### Patch Changes

- Add `rewards.listAwards` (also `rewardsService(core)` from `@polyester/sdk/services/rewards`) to list published reward campaign awards for the authenticated root account, newest first. Each award includes its campaign, asset, exact `amountBaseUnits`, `fulfillmentMethod`, `fulfillmentState`, `publishedAt`, payout `network`, `fulfillmentRevision`, `destinationAddress`, and `transactionId`. `limit` accepts 0 through 100 (0 or omitted uses 50), and `pageToken` is capped at 256 characters. Requires a session token; API keys are not accepted. ([#187](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/187))

- Add `rewards.setDestination` to record a write-once payout destination for an award owned by the authenticated root account. Pass the award's `fulfillmentRevision` as `expectedRevision` (a positive decimal string) and a client-generated `requestId` (1 through 128 characters, reused on retry); `awardId` accepts 1 through 128 characters and `destinationAddress` 1 through 512. Requires a session token and a fresh step-up proof via `stepUpToken`; it does not execute a transfer or mark the award delivered. ([#189](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/189))

## 0.30.0

### Minor Changes

- Add a `fetch` option to the client config, `createPolyesterServerClientFromCookies`, and `createPolyesterServerClientFromRequest` for sending SDK HTTP requests through a custom fetch implementation. SDK auth, error mapping, and timestamp-skew detection still apply. Defaults to the global `fetch`. ([#184](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/184))

- Add tree-shakable client cores. `PolyesterCore`, `PolyesterBrowserCore`, and `PolyesterServerCore` (plus `createPolyesterServerCoreFromCookies`/`FromRequest`) wire transports, realtime, catalogs, and auth, and reach every other service through `@polyester/sdk/services/*` accessors such as `ordersService(core)`, so bundles only include the services they call. The full clients are unchanged and return the same instances as the accessors (`client.orders === ordersService(client)`). ([#186](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/186))

  Error-detail decoders and API-key signing now load on demand. SDK transports load decoders before mapping errors; call `loadErrorDetailDecoders(error)` before synchronously mapping a raw `ConnectError` that did not come through an SDK transport, or `loadErrorDetailDecoders()` to preload all of them.

### Patch Changes

- Throw a retryable `NetworkError` when the global `fetch` resolves without a `Response` (for example, when a browser extension patches `fetch`) instead of crashing with a `TypeError` while checking for timestamp-skew errors. ([#184](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/184))

## 0.29.2

### Patch Changes

- Decode the `MAX_SLIPPAGE_INVALID` trigger failure as `failureReason: "max_slippage_invalid"` instead of `"unspecified"`. Triggers fail with this reason when their maximum slippage cannot produce a valid execution price bound. ([#182](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/182))

## 0.29.1

### Patch Changes

- Surface the claims `SOCIAL_VERIFICATION_REQUIRED` error code as a non-retryable `PreconditionFailedError` detail when a daily reward claim needs a verified X or Discord account. ([#177](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/177))

- Expose `SocialVerification.errorCode` (`"social_account_already_linked"`, `"unspecified"` when no typed failure applies) and map `AUTH_SOCIAL_ACCOUNT_ALREADY_LINKED` RPC failures to a non-retryable `AlreadyExistsError`. Treat an already-linked verification as final for the current account: direct the user to the Polyester account already linked to that social identity instead of restarting verification. ([#180](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/180))

- Clarify `subaccounts.listInvites` docs: omit `direction` to list both incoming and outgoing invitations, or pass `"incoming"` or `"outgoing"` to filter. `"all"` is not an accepted value. ([#181](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/181))

- Map API-key `TIMESTAMP_SKEW` rejections to a new retryable `TimestampSkewError` (`code: "TIMESTAMP_SKEW"`) instead of a generic non-retryable `AuthenticationError`. This covers both `application/problem+json` and Connect error responses. Retrying the call signs it again with a fresh timestamp. For large bursts of API-key requests, bound concurrency so requests don't wait in the runtime's fetch queue past the skew window. ([#181](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/181))

- Require `lineageId` when passing `throughGeneration` to `trades.list`. Combining `throughGeneration` with `orderId` or no execution scope now fails validation and type checking instead of reaching the backend. ([#177](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/177))

## 0.29.0

### Minor Changes

- Decode address-book account scopes as the `AddressBookAccountScope` union keyed by `scopeType`. Root scopes no longer expose the wire placeholder `subaccountId` (previously `"1"`), subaccount scopes always include `subaccountId`, and unspecified scopes include it only when non-zero. Narrow on `scopeType` before reading `scope.subaccountId`. ([#175](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/175))

- `ApiKey.policyId` is now `""` instead of `undefined` when no policy is attached, matching `DEFAULT_API_KEY_POLICY.id` so keys can be matched to policies by ID. `apiKeyPolicies.get({ policyId: "" })` now returns the default policy instead of throwing. Replace any `policyId === undefined` checks with `!policyId`. ([#175](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/175))

### Patch Changes

- Format an unset `subaccountPolicyId` as `""` instead of `"1"`, so subaccounts on the placeholder policy match its `""` ID ([#175](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/175))

## 0.28.1

### Patch Changes

- Encode and decode absolute max-slippage ticks as int64 `bigint` values instead of int32 numbers. Absolute slippage inputs now accept values up to the int64 price ceiling, and `maxQuoteSlippage` on spot order constraints reports that ceiling instead of `2.147483647`. ([#173](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/173))

## 0.28.0

### Minor Changes

- Map HTTP 501 and Connect `unimplemented` to the new `NotImplementedError` instead of `InternalServerError`. Bare HTTP error responses without a Connect body now map by their status code instead of collapsing to `InternalServerError`. ([#171](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/171))

## 0.27.3

### Patch Changes

- Expose `actionTaken` on batch replacement admission and status items so callers can distinguish successor replacements from cancel-only outcomes. Clarify single-order timeout reconciliation and the 15-minute batch-create replay window. ([#168](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/168))

- Encode and decode trading prices, price deltas, and slippage ticks at scale 9 instead of 6. Price inputs now accept up to nine decimal places, and absolute max-slippage values are capped at `2.147483647` quote units by the int32 wire field. ([#170](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/170))

- Expose the current trailing threshold as `triggerPrice` on trailing trigger runtime details, and add the `activated` trigger event type for list filters and event output. ([#170](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/170))

## 0.27.2

### Patch Changes

- Expose `marketDataVolumeScale` on assets and `referencePriceScale` on pairs from spot config, and use them to decode candle volume, market-overview 24h base volume, and composite reference candle prices. Catalog snapshots without the new scales fall back to the asset quantity scale and the primary price scale. ([#166](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/166))

## 0.27.1

### Patch Changes

- Accept `phantom` as a wallet provider in login and refresh, preserving its metadata in browser and server sessions. ([#164](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/164))

## 0.27.0

### Minor Changes

- Add `subaccounts.createChallenge`, which returns the server-derived smart account address, salt nonce, and EIP-191 authorization. `auth.createSubaccount` now uses it and accepts a signer or a signer factory plus an optional `ownerAddress`. ([#162](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/162))

- Remove the `purpose` field from `auth.createWalletChallenge`; wallet challenges are login-only. ([#162](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/162))

### Patch Changes

- Decode structured `claims` error details, mapping rate-limit and temporarily-unavailable codes to the typed retryable errors. ([#162](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/162))

- Expose `inheritedCumQty` on orders, the filled quantity carried over from predecessors when a replacement was accepted. ([#162](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/162))

- Map `AUTH_SUBACCOUNT_CHALLENGE_INVALID` to the new `SubaccountChallengeInvalidError` so callers can reissue a stale subaccount challenge. ([#162](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/162))

## 0.26.1

### Patch Changes

- Fix UserOperations accepted then rejected by the bundler by using per-operation paymaster stubs and `pm_getPaymasterData`. ([#160](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/160))

- Restore paymaster gas estimate buffering (+20%, 50k floor), while preserving stub-provided limits during preparation. ([#160](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/160))

## 0.26.0

### Minor Changes

- Memoize `createPolyesterSmartAccountClient` per account, environment and options so the gas price cache and warmed connections survive across submissions. ([#157](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/157))

- Add `waitForPolyesterUserOperationReceipt`, which polls `pimlico_getUserOperationStatus` at a 250ms default interval, fetches the receipt only once included, fails fast on `rejected` or `failed`, and keeps checking the chain for operations the bundler reports as `not_found`. The client default `pollingInterval` is now 250ms, so viem's built-in `waitForUserOperationReceipt` also polls four times as often. ([#157](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/157))

- Sponsor smart-account UserOperations with `pm_sponsorUserOperation` instead of `pm_getPaymasterData`, signing over client-buffered account gas limits, and cache the paymaster stub so warm-up removes one round trip per submission. The stub is fetched once with a synthetic operation and reused, which relies on the Polyester paymaster returning constant stub data regardless of the operation or context. ([#157](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/157))

- Add an `onPhase` timing hook to `sendPolyesterUserOperation` and `waitForPolyesterUserOperationReceipt` reporting `prepare`, `sign`, `send`, and `receipt` durations. Observer errors never affect the result. ([#157](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/157))

### Patch Changes

- Raise the smart-account gas price cache TTL from 10s to 60s. `sendPolyesterUserOperation` clears the cache when submission fails after signing, and `waitForPolyesterUserOperationReceipt` clears it on a bundler `rejected` status. ([#157](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/157))

- Return zero from `getSessionTimeToExpiry()` for malformed JWTs even when their payload contains a future expiration. ([#159](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/159))

- Scope local bearer and display-session cookies by port across browser storage and server parsing, including default ports and custom bearer-cookie names. Framework cookie stores must provide `cookieLocation`; local sessions do not fall back to shared legacy cookies. ([#159](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/159))

- Retain foreign environment fingerprints during display-session reads so the next bearer-token read can reject and clear the mismatched session. ([#159](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/159))

- Prevent superseded restoration, login, and refresh operations from clearing or overwriting a newer session. Superseded restores return `null`, and superseded logins reject with `AbortError`. ([#159](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/159))

- Preserve authentication when session restoration fails because of a transient request or signer initialization error. Propagate these failures for retry while continuing to clear expired or backend-rejected sessions. ([#159](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/159))

## 0.25.1

### Patch Changes

- Preserve auth sessions across regional gateways and bump the display-session cookie version. ([#154](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/154))

## 0.25.0

### Minor Changes

- Add daily reward claim status and claiming, and support good-til-date limit orders with expiry validation and order expiry output. ([#152](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/152))

- Decode unknown proto enum values on read paths as `"unspecified"` instead of throwing a `ValidationError`. When the server adds a new enum member that this SDK build does not know, the affected field now degrades to `"unspecified"` and the rest of the payload stays readable. Public output unions are unchanged since they already included `"unspecified"`. ([#152](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/152))

- Validate wallet login signatures as 65-byte hexadecimal EOA signatures while preserving universal signature support for subaccount creation. ([#152](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/152))

## 0.24.1

### Patch Changes

- Notify consumers of terminal realtime server disconnects and unsubscribes with their code and reason, and remove stopped channels from active tracking. ([#148](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/148))

- Read the current JWT provider value for every realtime token request so additional subscribers cannot retain stale credentials after token rotation or logout. ([#149](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/149))

- Declare the account signer's `ownerAddress` (the connected EOA) as the LOGIN challenge `signerAddress` instead of the Safe `accountAddress`, so wallet login and session refresh authenticate a Safe smart account with a distinct EOA signer. Subaccount creation challenges are unchanged. ([#151](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/151))

## 0.24.0

### Minor Changes

- Add order lineage, paginated execution history, and settlement transfers to order and trade reads. ([#143](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/143))

### Patch Changes

- Honor market overview subscription symbol filters in live and buffered updates. ([#144](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/144))

- Normalize caller transport cancellations so `isAbortError` recognizes them, prevent pre-aborted requests from starting, and format cancellations as "Request canceled." ([#145](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/145))

## 0.23.1

### Patch Changes

- Update devnet and testnet API and WebSocket URLs. ([#141](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/141))

## 0.23.0

### Minor Changes

- Replace nonce authentication with server-issued SIWE challenges for wallet login and subaccount creation. ([#138](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/138))

- Replace wallet Trading withdrawal `signTypedData` with EIP-191 `signMessage` authorization. ([#137](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/137))

## 0.22.3

### Patch Changes

- Point the testnet Multicall3 address at the verified deployment `0xfc9B0991DC84E419C9b164dE89795958a5B0A0cF` (block 179823). ([#135](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/135))

## 0.22.2

### Patch Changes

- Fix the testnet environment chain ID to `888169` and chain name to `Polyester Chain Testnet`. ([#133](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/133))

## 0.22.1

### Patch Changes

- Export `POLYESTER_TESTNET_ENVIRONMENT` from the SDK package entrypoint so consumers can import the testnet preset alongside devnet. ([#131](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/131))

## 0.22.0

### Minor Changes

- feat(sdk)!: add currency conversion config and rates; remove `polyesterChainId` from Zipper config and catalogs. ([#129](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/129))

- feat: add testnet environment ([#130](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/130))

### Patch Changes

- Require Web Crypto for generated trading-withdraw nonces and order mutation request IDs, with a secure random-byte fallback when `randomUUID` is unavailable. ([#127](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/127))

## 0.21.1

### Patch Changes

- Preserve `polyesterChainId` and pair quantity scales in reactive catalogs. ([#125](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/125))

## 0.21.0

### Minor Changes

- fix(social-verification)!: omit `handle` when starting Discord verification; the authenticated bot supplies the identity. Remove `handle` from Discord `start()` inputs. `method` is now provider-specific: Twitter accepts only `"profile"`, Discord accepts `"channel"` or `"dm"`. Omitted `method` uses the provider default: Twitter profile or Discord channel. ([#124](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/124))

- feat(market-overview)!: expose `volume24hUsd` and preserve unavailable volumes in list and subscription responses. `volume24hBase` and `volume24hQuote` can now be `undefined` when scaled amounts overflow; `volume24hUsd` is `undefined` when reliable valuation is unavailable. Handle missing values separately from zero (`"0"`). ([#124](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/124))

- feat(market-overview)!: replace `orderBy: "volume_24h_quote"` with `"volume_24h_usd"`. Market lists now default to descending canonical USD volume. ([#124](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/124))

- Rename `POLYESTER_TESTNET_ENVIRONMENT` to `POLYESTER_DEVNET_ENVIRONMENT`. The bundled preset already targeted Polyester devnet (`api-devnet.polyester.ai`); the export, environment `name`, and chain `name` now match. Import `POLYESTER_DEVNET_ENVIRONMENT` instead. ([#122](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/122))

### Patch Changes

- feat(candles): expose exact decimal `quoteVolume` on candle rows and realtime updates, and aligned `quoteVolume` arrays on columnar responses. ([#124](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/124))

- feat(market-overview): add `getSpotVolumeHistory()` for pair and total trailing-24h USD volume series as decimal strings. Accept up to 2,000 distinct `symbolIds`; empty or omitted filters select all pairs. The 97 samples overlap at 15-minute intervals and must not be summed as period volume. ([#124](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/124))

## 0.20.1

### Patch Changes

- Expose `auth.acceptTerms()` for explicit consent through an interactive JWT session and `Profile.currentTermsAccepted` on profile responses. Preserve the typed `AUTH_TERMS_NOT_ACCEPTED` error detail when provisioning requires consent. Login does not accept terms automatically; creating subaccounts, API keys, and deposit addresses requires current acceptance. ([#120](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/120))

## 0.20.0

### Minor Changes

- feat(orders): replace `symbolId` with `symbolIds` in `orders.cancelAll()` to cancel orders across up to 100 symbols. Use `symbolIds: [id]` for one symbol; empty or omitted filters match all symbols. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

- refactor(errors)!: remove `isStaleQuoteError()`. Use `error instanceof StaleQuoteError` for SDK failures, or inspect `error.detail` for the structured orders rejection code. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

- feat(errors): expose recognized backend rejections as typed `PolyesterError.detail` values, discriminated by service. `getOrderErrorDetail()` is removed; read `error.detail` instead. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

### Patch Changes

- feat(orders): expose the `CANCEL_REQUEST_EXPIRED` rejection code when a cancellation exceeds its replay window. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

- feat(triggers): expose `executedQty` and `executedLevels` on ladder runtime details. Quantity is a decimal base-asset amount, and levels count distinct levels with any fill, including partial fills. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

- fix(transfers): map structured withdrawal and internal-transfer rate-limit errors to `RateLimitError` and temporary dependency failures to `ServiceUnavailableError`, preserving retryability when the transport status alone does not identify the failure. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

- feat(triggers): add `execution.maxSlippage` to market IOC TWAPs, accepting a decimal price delta or 1 to 10,000 basis points. The protection applies to each slice; omitting it uses the pair default. ([#118](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/118))

## 0.19.3

### Patch Changes

- Stop automatic realtime connection and subscription token retries for non-retryable SDK errors while preserving the original errors in `onError`. Transient failures retain Centrifuge backoff, and explicit private subscriptions can restart after authentication or request inputs are corrected. ([#116](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/116))

## 0.19.2

### Patch Changes

- fix(triggers): reject trailing-distance inputs above 10,000 bps before sending trigger requests. ([#114](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/114))

## 0.19.1

### Patch Changes

- feat(balances): add root portfolio equity history and snapshot methods. ([#112](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/112))

## 0.19.0

### Minor Changes

- fix(trades)!: `trades.list()` input is now a discriminated union. Passing `afterMatchId` requires a positive `symbolId`, matching the backend's `after_match_requires_symbol` rule; violating it is a compile error and an SDK `ValidationError` instead of a 400. ([#110](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/110))

### Patch Changes

- fix(market-overview): skip rows whose symbolId the catalog cannot resolve instead of failing the whole `list()` result or `subscribe()` snapshot; `subscribe()` now accepts an optional `symbolIds` filter forwarded to its snapshot request. ([#110](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/110))

## 0.18.0

### Minor Changes

- feat(orders): expose typed cancellation submission statuses across order cancellation methods. ([#108](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/108))

- feat(accounts): expose typed resolved-account kinds from account resolution results. ([#108](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/108))

- feat(subaccounts): encode typed invitation direction filters for invitation reads. ([#108](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/108))

## 0.17.0

### Minor Changes

- feat(auth)!: expose public API key identifiers as `ak_` handles in caller introspection. ([#105](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/105))

- feat(subaccounts): expose typed lifecycle statuses for subaccount reads and updates. ([#104](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/104))

### Patch Changes

- feat(profile): add generated username offer and claim methods for onboarding. ([#105](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/105))

## 0.16.0

### Minor Changes

- **Breaking:** Remove `subaccounts.delete()`, the `DeleteSubaccountInput` type and schema, and the `"deleted"` subaccount status. `auth.v1.SubaccountService` exposes no delete RPC, and both `Subaccount.status` and `SubaccountUpdateSpec.status` document only `"active"` and `"disabled"`, so `delete()` was sending a `status: "deleted"` update the backend does not accept. Use `subaccounts.update({ status: "disabled" })` instead; `status` on reads and updates is now `"active" | "disabled"`. ([#101](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/101))

### Patch Changes

- Omit attached-risk legs whose only content is a `not_configured` runtime state, so consumers do not mistake absent risk configuration for a configured leg. ([#103](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/103))

## 0.15.1

### Patch Changes

- feat(transfers): expose external chain IDs on transfer source and destination details. ([#99](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/99))

## 0.15.0

### Minor Changes

- fix(policies): scale subaccount policy `maxOrderSize` to the quote microunits that `max_order_notional` expects. It is now a decimal USDT string on read and write, so a 100,000 USDT cap is `"100000"`, and `"0"` still means no cap. ([#97](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/97))

  It was previously a `number` written straight to the wire, so a cap of 100000 took effect as 0.1 USDT and small orders failed with `POLICY_MAX_NOTIONAL`. Caps saved before this fix hold raw microunits and read back at their true value now, so re-set any that look a million times too small.

### Patch Changes

- fix(services): reject inputs that overflow their protobuf `uint32` field with a validation error, instead of accepting them and failing later in the encoder. Covers deposit and address-book chain IDs, market-data, candles and heatmap symbol IDs, `limit` on market overview, and `maxOpenOrders` on subaccount policies. ([#97](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/97))

- fix(triggers): enforce the 1 to 10,000 bps `maxSlippage` cap on standalone trigger create and modify, matching attached trailing stops and market IOC orders. ([#97](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/97))

## 0.14.2

### Patch Changes

- Restore the `feesPb`, `tradingRateLimitPb`, and `vipPb` namespaces from the `unstable/gen` entrypoint. ([#95](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/95))

## 0.14.1

### Patch Changes

- docs(orders): clarify batch-create idempotency and optional per-item client order IDs. ([#93](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/93))

- feat(triggers): add explicit activation-price and max-slippage clearing to trigger modifications. ([#93](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/93))

## 0.14.0

### Minor Changes

- feat(orders): rename `Order.origQty` to `Order.totalQty` to represent the current accepted total after successful modifies. ([#91](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/91))

## 0.13.0

### Minor Changes

- refactor(services): replace positional Connect transport constructor arguments with capability-scoped transport objects. Direct service construction now passes `{ authApi }`, `{ publicApi }`, or both as the first argument. ([#89](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/89))

### Patch Changes

- fix(subaccounts): route `listRoles` through the public transport without authentication headers while keeping caller-effective permission reads authenticated. ([#89](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/89))

## 0.12.0

### Minor Changes

- feat(triggers): replace the free-form trigger event `reason` string with typed `cancelReason` and `failureReason` labels on trigger and trigger-event outputs. ([#86](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/86))

### Patch Changes

- feat(address-book): add a `minimumViewRevision` option to `getView` and expose `viewRevision` on views and invalidation events to support revision-aware refetching. ([#86](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/86))

- feat(mfa): expose the MFA-elevated session details and access token returned when finishing TOTP and passkey enrollments. ([#86](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/86))

## 0.11.0

### Minor Changes

- feat(rate-limits): rename the trading rate-limit rule field from `tier` to `vipTier` so quota catalog rows match the VIP policy field name. ([#85](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/85))

### Patch Changes

- feat(subaccounts): add `listRoles` and `getEffectivePermissions` methods exposing the built-in role/permission catalog and the caller's effective role-granted permissions for a subaccount. ([#83](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/83))

- feat(trades): add an `afterMatchId` replay-cursor filter to the user trades list method for gap-free backfill alongside the execution WebSocket. ([#83](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/83))

## 0.10.0

### Minor Changes

- Expose attached-risk leg lifecycle state, timestamps, trigger IDs, and child order IDs on order reads, and preserve both stop-loss and trailing-stop legs returned by the backend. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Make public IDs round-trip as base58 strings, and preserve order-transfer match IDs and ledger-transfer link IDs as decimal strings without uint64 precision loss. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

### Patch Changes

- Bound catalog-readiness event queues without leaving subscriptions silently connected after continuity loss, let snapshot-backed feeds own coalescing and recovery, defer listeners added during an event until the next emission, and retry the lazy realtime transport import after a transient chunk-load failure. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Keep ledger-transfer list and realtime data available without catalog readiness now that transfer amounts use the protocol's fixed E18 scale. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Keep orderbook price buckets and sequence recovery correct by rounding asks upward, ignoring stale resets, stopping replay after a gap, and retrying failed snapshots. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Preserve bearer authentication when the unsigned display-session cookie is missing, expire JWTs at their exact expiration time, serialize fractional JWT expirations with integer cookie lifetimes, and let server session verification distinguish unauthenticated sessions from transient API failures even when using injected transports. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Reject invalid integer inputs, fail closed when a catalog-backed scale is unavailable, and make timestamp and u128 conversion exact at their wire boundaries. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Reject malformed or out-of-range order and trigger inputs before protobuf encoding, including symbol IDs, client order IDs, trailing distances, maximum-slippage BPS, TWAP intervals, and ladder price ranges. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Preserve trigger timestamp milliseconds, fail loudly for trigger symbols absent from the catalog, and align spot-order validation with advertised int64 wire ceilings. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

- Return typed SDK errors for credential-provider failures across HTTP and realtime, reject private realtime subscriptions immediately when a synchronous JWT provider has no token, preserve JWT authentication visibility and overrides in user interceptors, validate Ed25519 secret keys before signing, sign API-key requests after user interceptors finalize unary messages, reject unsupported Connect stream signing, align raw retry classification with mapped errors, parse Retry-After safely, and reject query strings in Connect API base URLs. ([#81](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/81))

## 0.9.1

### Patch Changes

- Reject trailing-stop maximum slippage above 10,000 basis points. ([#79](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/79))

- Accept exact decimal inputs with zero padding beyond the configured wire scale. ([#79](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/79))

- Reject OCO risk policies that do not include both take-profit and a stop leg. ([#79](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/79))

- Reject duplicate non-empty client order IDs in one batch create request. ([#79](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/79))

- Reject unsupported characters in cancel-all request IDs, matching other order mutations. ([#79](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/79))

## 0.9.0

### Minor Changes

- [#76](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/76) [`b1ae171`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1ae171854e8e66ab699dc228fbf01cbeff6ff47) Thanks [@aiiven](https://github.com/aiiven)! - feat(policies): use stable symbol IDs in API-key and subaccount policy selectors.

- [#76](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/76) [`b1ae171`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1ae171854e8e66ab699dc228fbf01cbeff6ff47) Thanks [@aiiven](https://github.com/aiiven)! - feat(trading): use stable symbol IDs for spot-market requests and responses.

## 0.8.0

### Minor Changes

- [#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75) [`f9590a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f9590a0fbfabfc6a4bb5ba6d12870e7dd30f1a4a) Thanks [@aiiven](https://github.com/aiiven)! - feat(orders): require symbol IDs for order modifications and expose policy-specific rejection codes.

- [#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75) [`f9590a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f9590a0fbfabfc6a4bb5ba6d12870e7dd30f1a4a) Thanks [@aiiven](https://github.com/aiiven)! - feat(triggers): require symbol IDs for policy-routed modifications and resumes, and expose failed trigger events.

- [#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75) [`f9590a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f9590a0fbfabfc6a4bb5ba6d12870e7dd30f1a4a) Thanks [@aiiven](https://github.com/aiiven)! - feat(policies): expose the spot-only policy contract, including read-address-book permissions and no-permission API-key defaults.

### Patch Changes

- [#75](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/75) [`f9590a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f9590a0fbfabfc6a4bb5ba6d12870e7dd30f1a4a) Thanks [@aiiven](https://github.com/aiiven)! - perf(gen): omit unused option-only descriptor metadata from published protobuf modules.

- [#72](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/72) [`1a5fa52`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/1a5fa52df5ac8a8bd4bb4b64dfb705c8abb3ac60) Thanks [@huntabyte](https://github.com/huntabyte)! - fix(auth): Ed25519 API-key signing now allocates strictly increasing `X-API-TIMESTAMP` values, so concurrent requests in the same millisecond no longer share a timestamp and risk replay rejection on strict servers.

## 0.7.0

### Minor Changes

- [#70](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/70) [`a198991`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/a1989916b770136e38c9b9dc368f40e0a60a8856) Thanks [@aiiven](https://github.com/aiiven)! - fix(social-verification): align provider handle validation with backend limits and forbidden characters.

### Patch Changes

- [#70](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/70) [`a198991`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/a1989916b770136e38c9b9dc368f40e0a60a8856) Thanks [@aiiven](https://github.com/aiiven)! - feat(address-book): add atomic tag creation to address-book entry updates.

- [#70](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/70) [`a198991`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/a1989916b770136e38c9b9dc368f40e0a60a8856) Thanks [@aiiven](https://github.com/aiiven)! - feat(auth): map structured internal authentication failures to the SDK internal-server error.

## 0.6.0

### Minor Changes

- [#68](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/68) [`a1a35ec`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/a1a35ecaa2948bfd6c9f0a392426ea83fadc166f) Thanks [@huntabyte](https://github.com/huntabyte)! - Reject decimal order and trigger inputs that exceed protobuf signed-integer bounds with `CatalogConversionError`. `getSpotOrderConstraints()` now exposes the derived `maxPrice`, `maxQtyBase`, `maxNotionalQuote`, and `maxQuoteSlippage` wire ceilings.

## 0.5.0

### Minor Changes

- [#66](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/66) [`e8a5721`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/e8a5721b57be7ebd0b7edf80c4ed85919fccdb0a) Thanks [@huntabyte](https://github.com/huntabyte)! - `sendPolyesterUserOperation` now prepares the operation in a single pass, halving the network round-trips before the wallet signature prompt appears. Gas estimation errors now propagate instead of triggering a silent resend.

- [#66](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/66) [`e8a5721`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/e8a5721b57be7ebd0b7edf80c4ed85919fccdb0a) Thanks [@huntabyte](https://github.com/huntabyte)! - `sendPolyesterUserOperation` accepts a new `onWalletSignatureRequested` callback that fires right before the wallet is asked to sign, so UIs can show an accurate "confirm in your wallet" state.

- [#66](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/66) [`e8a5721`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/e8a5721b57be7ebd0b7edf80c4ed85919fccdb0a) Thanks [@huntabyte](https://github.com/huntabyte)! - New `warmPolyesterSmartAccountClient` helper pre-fetches the gas price and warms RPC connections ahead of a submission. The smart account client now caches gas prices, for 10 seconds by default, configurable via the new `options.gasPriceCacheTtlMs` setting.

### Patch Changes

- [#66](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/66) [`e8a5721`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/e8a5721b57be7ebd0b7edf80c4ed85919fccdb0a) Thanks [@huntabyte](https://github.com/huntabyte)! - The smart account client polls for UserOperation receipts every second instead of every 4 seconds, configurable via the new `options.pollingIntervalMs` setting.

## 0.4.5

### Patch Changes

- [#64](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/64) [`354cfd2`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/354cfd29d21c44a4b82203938c3c10d4848e3943) Thanks [@huntabyte](https://github.com/huntabyte)! - fix(orderbook): stop `orderbook.createSubscription()` from subscribing to order-book delta channels that have no publisher. The backend only publishes `public:spot:orderbook:deltas:depth:{depth}:...` for depths `1, 20, 50, 200, 500`, but the REST snapshot accepts `1, 5, 10, 20, 50, 100, 200, 500, 1000`. Passing one of the REST-only depths (for example `depth: 10`) subscribed successfully and then never delivered a publication, leaving the book permanently empty with no `onError`. Requested depths now ride the smallest published channel depth that covers them and are sliced back down locally, so every documented depth delivers updates.

## 0.4.4

### Patch Changes

- [#62](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/62) [`ee6f75a`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/ee6f75a64294ffad0c05dfdfe65b802699509b7b) Thanks [@huntabyte](https://github.com/huntabyte)! - fix: `orders.batchCreate()` no longer throws a `ValiError` when the server rejects an item without a structured error detail; the item is surfaced as `status: "rejected"` with `error` possibly undefined. Also documents that `orders.listOpen()` is paginated and must be drained via `nextPageToken`.

## 0.4.3

### Patch Changes

- [#60](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/60) [`f91caab`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/f91caaba589ce689ffaa7d310f833373a8e61009) Thanks [@huntabyte](https://github.com/huntabyte)! - Declare the Multicall3 deployment (`0xF35A6AE5408fa1356064849D0BC3855f801aa6aC`, block 563457) on the Polychain testnet chain definition so viem clients can batch contract reads via multicall instead of issuing one `eth_call` per read.

## 0.4.2

### Patch Changes

- [#58](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/58) [`c253beb`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/c253beb9cbef0ab5d5d33cc330edc85ff585468b) Thanks [@aiiven](https://github.com/aiiven)! - feat(vip): add VIP tier catalog and status methods for public policy snapshots and authenticated caller-root qualification.

- [#58](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/58) [`c253beb`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/c253beb9cbef0ab5d5d33cc330edc85ff585468b) Thanks [@aiiven](https://github.com/aiiven)! - feat(fees): add a spot fee rate method for authenticated effective maker and taker rates.

- [#58](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/58) [`c253beb`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/c253beb9cbef0ab5d5d33cc330edc85ff585468b) Thanks [@aiiven](https://github.com/aiiven)! - feat(rate-limit): add trading rate-limit catalog and effective limit methods for public quota snapshots and authenticated account targets.

## 0.4.1

### Patch Changes

- [#56](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/56) [`1e34fde`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/1e34fde8be60b78006ee2c0c23595c0561ab5d6a) Thanks [@huntabyte](https://github.com/huntabyte)! - Repair the published TypeScript declarations so public contract and service callback types retain their precise inferred shapes.

## 0.4.0

### Minor Changes

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Standardize market-data limits as positive integers, reject string and invalid candle or trade limits, and require a valid orderbook heatmap limit before sending requests.

### Patch Changes

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Return exact nanosecond timestamp strings and epoch-millisecond timestamps from single-order cancel and modify operations.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Preserve server-side bearer authentication when the display-session cookie is missing or invalid, and discard it when an explicit display session belongs to another environment.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Clarify that single-order cancellation acknowledges the request and requires lifecycle reconciliation, while missing targets remain not-found errors.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Document that realtime callers must wait for `onOpen` before issuing writes whose events they need to observe.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Allow transfer history to be listed without an input object and return an SDK validation error for null account-scoped inputs.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Accept Next.js-style cookie getters when creating server clients.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Reject malformed client, environment, account signer, and catalog configuration with SDK error types before constructing clients or marking catalog snapshots fresh.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Isolate synchronously thrown auth event listener errors so one failing listener cannot reject a completed auth operation or prevent later listeners from running.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Return login nonce expiration timestamps as JSON-safe epoch-millisecond numbers instead of raw protobuf timestamp objects.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Route private realtime subscription authentication failures through `onError` when provided, and throw from `subscribe()` when no error observer exists.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Return `null` from `orders.getDetails` when the backend reports that the requested order was not found.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - fix(auth): prevent malformed hex credentials from appearing in configuration error messages.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Return `false` from `isJwtValid` for non-string values instead of throwing.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Validate subaccount activity limits and balance-history ledger IDs as non-negative integers before serializing requests.

- [#54](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/54) [`b1d07ad`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b1d07ad58e7f691cbf0df32e5905bd679c1adfd6) Thanks [@huntabyte](https://github.com/huntabyte)! - Translate schema validation, authentication, RPC, and network failures into the documented `PolyesterError` hierarchy.

## 0.3.1

### Patch Changes

- [#52](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/52) [`4d78227`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/4d78227aa61b426e3ab8c0ac9bff6225a7865d42) Thanks [@aiiven](https://github.com/aiiven)! - feat(market-overview): expose the current multi-venue index price on market overview rows.

## 0.3.0

### Minor Changes

- [#50](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/50) [`b3412a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b3412a0f8376708be58f60b2d4e1537e35867757) Thanks [@aiiven](https://github.com/aiiven)! - feat(triggers): support time-scheduled trigger events that omit conditional fire prices.

### Patch Changes

- [#50](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/50) [`b3412a0`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/b3412a0f8376708be58f60b2d4e1537e35867757) Thanks [@aiiven](https://github.com/aiiven)! - feat(orders): add trigger ID filters for listing open and historical child orders.

## 0.2.2

### Patch Changes

- [#48](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/48) [`e363ba5`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/e363ba59cb1a5e52ac8ea04f843e2562c9e29f0d) Thanks [@huntabyte](https://github.com/huntabyte)! - feat(orders): export a canonical cause-chain parser for structured order error details.

## 0.2.1

### Patch Changes

- [#45](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/45) [`9e85a55`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/9e85a55432709b88257fb2bdd26a8c09b92935e2) Thanks [@aiiven](https://github.com/aiiven)! - feat(orders): add structured rate-limit details to order rejection results and typed errors.

- [#45](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/45) [`9e85a55`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/9e85a55432709b88257fb2bdd26a8c09b92935e2) Thanks [@aiiven](https://github.com/aiiven)! - feat(realtime): add structured error details to trading command rejections.

## 0.2.0

### Minor Changes

- [#43](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/43) [`0896e61`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/0896e61b83df934b090e7a31903fe3ba001c3a05) Thanks [@aiiven](https://github.com/aiiven)! - feat(ledger): add trading withdrawal request-fee codes to transfer filters and decoded records.

### Patch Changes

- [#43](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/43) [`0896e61`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/0896e61b83df934b090e7a31903fe3ba001c3a05) Thanks [@aiiven](https://github.com/aiiven)! - feat(withdraw): add a destination validation method to support preflight checks before external-chain withdrawals.

## 0.1.1

### Patch Changes

- [#41](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/41) [`4ee1746`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/4ee174671d677740aa9bfe911736dd51b758da6a) Thanks [@aiiven](https://github.com/aiiven)! - Expose trading withdrawal policy, contract, and execution failure reasons through lifecycle responses.

## 0.1.0

### Minor Changes

- [#39](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/39) [`7b7a16a`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/7b7a16a3ccaead38a0be19a19fcb23d3951db89c) Thanks [@huntabyte](https://github.com/huntabyte)! - Expose exact authenticated trade economics. `Trade.fee` now decodes the protobuf's E18 `U128` amount instead of the removed asset-scaled fee field. `Trade.referralShare` exposes the optional E18 referral amount, and `Trade.feeIsRebate` distinguishes rebates from charged fees.

- [#39](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/39) [`7b7a16a`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/7b7a16a3ccaead38a0be19a19fcb23d3951db89c) Thanks [@huntabyte](https://github.com/huntabyte)! - **Breaking:** Remove `Trade.tradeId` and `Trade.subaccountId`. Neither identifier exists in the upstream `UserTrade` response, so retaining them misrepresented the wire contract.

## 0.0.1

### Patch Changes

- [#34](https://github.com/Fabric-Labs/polyester-sdk-typescript/pull/34) [`95d43bb`](https://github.com/Fabric-Labs/polyester-sdk-typescript/commit/95d43bb278783b23f598bfe40fbc570531b9a857) Thanks [@huntabyte](https://github.com/huntabyte)! - initial alpha release
