---
"@polyester/sdk": patch
---

`selfTradePreventionMode` takes and reports `"decrement"`, which reduces both orders by the quantity that would have traded, also on orders with attached risk; an order left with nothing is canceled with the new cancel reason `stp_decrement`.
