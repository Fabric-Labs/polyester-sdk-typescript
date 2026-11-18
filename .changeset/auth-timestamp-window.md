---
"@polyester/sdk": patch
---

A `TimestampSkewError` from an `AUTH_TIMESTAMP_SKEW` refusal carries `detail.timestampWindow`: the server time and the receive and future windows the request timestamp was checked against.
