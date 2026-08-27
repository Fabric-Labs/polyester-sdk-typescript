---
"@polyester/sdk": patch
---

Preserve bearer authentication when the unsigned display-session cookie is missing, expire JWTs at their exact expiration time, serialize fractional JWT expirations with integer cookie lifetimes, and let server session verification distinguish unauthenticated sessions from transient API failures.
