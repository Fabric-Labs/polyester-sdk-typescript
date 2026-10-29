---
"@polyester/sdk": patch
---

pr: #203

Withdraw errors add `AMOUNT_EXCEEDS_ROUTE_PRECISION`, returned before any funds are reserved when an external-chain `amount_e18` is finer than the destination token's decimals. Round the amount down before signing.
