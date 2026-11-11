---
"@polyester/sdk": patch
---

Withdraw error details now carry `fieldPath` (the request field refused, such as `destinations[0].min_amount_e18`), `minFloor` (a decimal string, with `MIN_AMOUNT_BELOW_FLOOR`) and `payableFrom` (epoch milliseconds), each only when the server sends it. Map auto-withdraw refusals to form fields with `fieldPath`. The new codes `DESTINATION_INVALID`, `MIN_AMOUNT_BELOW_FLOOR`, `ROUTE_UNSUPPORTED` and `VERSION_CONFLICT` replace `INVALID_DESTINATION_ADDRESS`, `AMOUNT_BELOW_MINIMUM`, `UNSUPPORTED_ASSET` or `INVALID_DESTINATION_CHAIN`, and `CONFLICT` on rule writes. Treat `EXTERNAL_DESTINATION_COOLING_DOWN` as retryable after `payableFrom`, not as a whitelist error: the destination is listed.
