---
"@polyester/sdk": patch
---

GTC and GTD limit orders take `execution.displayQty` to show only that much on the book at a time (iceberg), below `qty` and at least `qty` divided by 100; orders report it as `displayQty` with the hidden part of `leavesQty` as `hiddenQty`. Refusals use the new codes `ICEBERG_NOT_ALLOWED`, `ICEBERG_DISPLAY_TOO_SMALL` and `ICEBERG_DISPLAY_INVALID`.
