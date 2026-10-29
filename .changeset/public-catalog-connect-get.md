---
"@polyester/sdk": patch
---

pr: #207

`tradingRateLimits.getConfig` and `vip.listTiers`, the public catalog reads, now use cacheable ConnectRPC GET.
