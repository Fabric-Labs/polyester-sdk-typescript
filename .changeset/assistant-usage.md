---
"@polyester/sdk": patch
---

`client.assistant.getUsage` returns today's free assistant credits for the caller's VIP tier, how many are used and left, when they reset, and what pays for the next messages. A run with no credits left fails with category `daily_limit_reached`, and one sent while the assistant is paused for the day with `assistant_paused`. Available on devnet only.
