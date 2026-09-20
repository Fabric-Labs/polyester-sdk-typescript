---
"@polyester/sdk": minor
---

Cut per-UserOperation latency in the smart-account client: replace `pm_getPaymasterData` with `pm_sponsorUserOperation` (which signs over the client-buffered account gas limits), cache the paymaster stub alongside the gas price and prime both in warm-up, poll `pimlico_getUserOperationStatus` every 250ms via `waitForPolyesterUserOperationReceipt`, cache gas prices for 60s, memoize `createPolyesterSmartAccountClient` per account and environment, add an `onPhase` timing hook, and export `preloadSmartAccountSdk`. Note: the client's default `pollingInterval` is now 250ms, so the built-in viem `waitForUserOperationReceipt` also polls four times as often as before; prefer `waitForPolyesterUserOperationReceipt`.
