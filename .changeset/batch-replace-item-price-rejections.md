---
"@polyester/sdk": minor
---

Breaking: `orders.batchReplace` resolves an item refused for its value, such as a price off the tick size or an invalid attached-risk price, as a rejected item in `results` with its `code` and `error`, instead of failing the whole batch. Resend only the corrected rejected items under a fresh `requestId`.
