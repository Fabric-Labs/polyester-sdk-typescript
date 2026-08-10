# @polyester/sdk

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
