---
"@polyester/sdk": minor
---

New `warmPolyesterSmartAccountClient` helper pre-fetches the gas price and warms RPC connections ahead of a submission. The smart account client now caches gas prices, for 10 seconds by default, configurable via the new `options.gasPriceCacheTtlMs` setting.
