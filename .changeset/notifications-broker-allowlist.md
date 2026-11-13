---
"@polyester/sdk": patch
---

`client.notifications` decodes `broker_allowlist_change` notices about QuickSwap broker vault payout address changes. These previously decoded as `"unspecified"`. Available on devnet only.
