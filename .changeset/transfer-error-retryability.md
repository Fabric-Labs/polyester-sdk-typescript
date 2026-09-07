---
"@polyester/sdk": patch
---

fix(transfers): map structured withdrawal and internal-transfer rate-limit errors to `RateLimitError` and temporary dependency failures to `ServiceUnavailableError`, preserving retryability when the transport status alone does not identify the failure.
