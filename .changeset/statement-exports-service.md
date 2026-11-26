---
"@polyester/sdk": patch
---

`client.statementExports` creates, gets and lists whole-period statement exports produced in the background as one CSV file each, downloadable for 7 days. API keys need `read-statements`; a root account at its limit of 5 exports in progress gets `PreconditionFailedError` (`STATEMENT_EXPORT_LIMIT_REACHED`) instead of a retryable `RateLimitError`.
