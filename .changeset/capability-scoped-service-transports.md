---
"@polyester/sdk": minor
---

refactor(services): replace positional Connect transport constructor arguments with capability-scoped transport objects. Direct service construction now passes `{ authApi }`, `{ publicApi }`, or both as the first argument.
