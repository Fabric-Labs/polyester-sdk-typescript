---
"@polyester/sdk": patch
---

An order or trigger write refused with `REQUEST_DEADLINE_EXCEEDED` maps to the new `RequestDeadlineExceededError` (code `"REQUEST_DEADLINE_EXCEEDED"`, retryable), a subclass of `TimestampSkewError`. The signed request passed authentication, but its receive window ended before admission. Nothing changed, and this is never an unknown outcome, so retrying, which signs again with a fresh timestamp, is safe. Every signed request now has this deadline, including requests sent without `recvWindow`, which get the 10-second default.
