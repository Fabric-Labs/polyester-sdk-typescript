---
"@polyester/sdk": minor
---

Map HTTP 501 and Connect `unimplemented` to the new `NotImplementedError` instead of `InternalServerError`. Bare HTTP error responses without a Connect body now map by their status code instead of collapsing to `InternalServerError`.
