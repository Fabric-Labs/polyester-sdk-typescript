---
"@polyester/sdk": minor
---

**Breaking:** Remove `Trade.tradeId` and `Trade.subaccountId`. Neither identifier exists in the upstream `UserTrade` response, so retaining them misrepresented the wire contract.
