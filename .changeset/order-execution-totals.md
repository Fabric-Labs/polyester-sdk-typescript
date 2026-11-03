---
"@polyester/sdk": patch
---

Orders carry their exact execution totals. `avgPx` is now the exact average execution price, up to 18 decimal places instead of rounded down to 9. `cumQuote` is the quote amount the fills used before fees, `"0"` with no fills. `feeTotal` (`{ amount, isRebate, qty }`) is the net fee in the order's `feeAsset`: order history and `getDetails` include it, open orders leave it out. It covers every fill once `feeTotal.qty` equals `cumQty`.
