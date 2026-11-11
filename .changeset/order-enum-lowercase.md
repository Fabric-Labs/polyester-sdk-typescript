---
"@polyester/sdk": minor
---

Breaking: order enum values are now lowercase everywhere, like the rest of the SDK and the Python, Rust and Go SDKs. `order.timeInForce` returns `"gtc" | "ioc" | "fok" | "gtd"` (was `"GTC" | "IOC" | "FOK" | "GTD"`), and `actionTaken` from `orders.modify`, `orders.batchReplace` and `orders.getBatchReplaceStatus` returns `"amended" | "replaced"` (was `"AMENDED" | "REPLACED"`). `orders.modify` and `orders.batchReplace` take `behavior: "amend_or_replace" | "amend_only" | "replace_only"`, and `orders.listHistory` takes `status: "filled" | "canceled" | "rejected"`. Uppercase inputs are now rejected.
