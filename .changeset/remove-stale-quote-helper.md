---
"@polyester/sdk": minor
---

refactor(errors)!: remove `isStaleQuoteError()`. Use `error instanceof StaleQuoteError` for SDK failures, or inspect `error.detail` for the structured orders rejection code.
