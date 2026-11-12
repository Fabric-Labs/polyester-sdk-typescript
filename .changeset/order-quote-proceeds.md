---
"@polyester/sdk": patch
---

A SELL market or limit IOC order can be sized by `quoteProceeds`, the quote it sells for before fees, instead of `qty`; BUY, GTC, GTD, FOK, attached risk and a peg are rejected before sending. Create and batch create results and orders echo it as `submittedQuoteProceeds`, and the order's `cumQuote` is what it received.
