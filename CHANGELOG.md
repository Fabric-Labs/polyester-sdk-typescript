# @polyester/sdk

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
