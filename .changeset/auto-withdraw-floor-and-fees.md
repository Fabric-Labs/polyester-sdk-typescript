---
"@polyester/sdk": patch
---

Auto-withdraw destinations add `minFloor`, the least one payout can pay now (the route minimum, above its current network fee). A new rule's `minAmount` must be at least the floor, and it is null when the route or fee is unknown: show no floor then, not zero. Run steps add `networkFee`, the fee charged on the withdrawal, which is null until the step is final. Steps and previews can report `destination_cooling_down` for a broker vault destination whitelisted less than 24 hours ago.
