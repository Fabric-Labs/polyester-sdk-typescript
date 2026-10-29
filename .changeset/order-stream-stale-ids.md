---
"@polyester/sdk": minor
---

pr: #207

`orders.subscribe`'s `onStale` receives `orderIds` when only those orders are behind. Their rows show an earlier state while the rest of the view is current. A later call replaces the earlier one, and `onStale(false)` means every order is current again.
