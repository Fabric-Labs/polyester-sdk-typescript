---
"@polyester/sdk": patch
---

`fees.getSpotRates` rows add `reserveFeeRatePercent` and `postOnlyReserveFeeRatePercent`, the rates a new order reserves its quote-asset fee at: the highest rate of any VIP tier on the market, so at least the effective rates. Size buy orders by the reserve rate, not the effective one. `breakdown` lists the components of the effective rates: the VIP tier rates, an optional `marketMultiplier`, `accountDiscounts` (`[]` when none) and an optional `referralDiscount`, with `effectiveFrom` and `effectiveTo` in Unix milliseconds. `nextChangeAt` is when a component next starts or ends, or `undefined` when no change is scheduled.
