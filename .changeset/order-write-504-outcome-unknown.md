---
"@polyester/sdk": patch
---

A server 504, client-side timeout (`timeoutMs` / `AbortSignal.timeout()`), or dropped connection (`NetworkError`) on an order or trigger write (create, batch create, modify, batch replace, cancel, batch cancel, cancel all, cancel all after; trigger create, OCO create, modify, cancel, batch cancel, OCO cancel, pause, resume) now throws `OutcomeUnknownError` (`retryable: false`) even without the `*_OUTCOME_UNKNOWN` detail, which the public edge strips. Read the order or trigger back before sending it again. Timeouts and network failures on reads and `previewOrder`, and caller cancellations, are unchanged.
