---
"@polyester/sdk": patch
---

Adds `strategies.returnBotFunds` and `getBotFundsReturn`, which return a stopped bot's spendable balances to the main account and follow the return until it completes (needs `return-strategy-bot-funds`).
