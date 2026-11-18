---
"@polyester/sdk": patch
---

Zipper chain variants add `supplyStatus` (`available`, `stale`, `missing`) and `supplyObservedAt`, and `supply` is now set only while the status is `available` or `stale`, so an unknown supply no longer reads as `"0"`. `zipper.subscribeZippedAssetSupply` updates add `status` and `observedAt` and leave out routes whose supply is unknown.
