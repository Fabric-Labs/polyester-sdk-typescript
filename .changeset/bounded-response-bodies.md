---
"@polyester/sdk": patch
---

SDK requests read at most 1 MiB of a non-Connect response body, such as an error page or a problem+json error, whatever its Content-Length. A longer body is canceled and the request fails with an `InternalServerError` carrying the HTTP status, instead of being buffered whole.
