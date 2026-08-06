# @polyester/sdk

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
