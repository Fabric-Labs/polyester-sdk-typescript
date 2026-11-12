---
"@polyester/sdk": patch
---

Order intents, single and batch, take `peg: { reference: "best_bid" | "best_ask", offsetTicks? }` to take the limit price from the book at entry, offset by a signed count of the pair's tick size and bounded by `execution.price`. It needs `qty` sizing, a limit execution and no attached risk; refusals use the new codes `PEG_LIMIT_VIOLATION`, `PEG_REFERENCE_UNAVAILABLE` and `INVALID_PEG`.
