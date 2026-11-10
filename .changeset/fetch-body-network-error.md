---
"@polyester/sdk": patch
---

If the connection drops while the SDK is reading a successful response body, the SDK now raises a retryable `NetworkError`. Before, it raised a non-retryable `InternalServerError` with the message "Failed to fetch". The SDK now handles the browser fetch messages "Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed" and "network error" the same way. Other `Unknown` errors map as before.
