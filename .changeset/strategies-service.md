---
"@polyester/sdk": patch
---

`client.strategies` writes, tests and proposes trading bots: it creates strategies and saves their drafts as versions, runs behaviour examples and backtests, records a deploy proposal of a strategy's revision and deploys it with `deployBot` from an MFA-elevated session, and reads, lists and stops bots. Errors carry a `strategies` detail, and a stale draft revision throws `RevisionConflictError`.
