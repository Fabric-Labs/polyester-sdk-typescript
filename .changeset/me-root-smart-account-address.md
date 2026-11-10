---
"@polyester/sdk": patch
---

`auth.me()` now returns `rootSmartAccountAddress`, the caller's root smart-account address as lowercase `0x` hex, or `""` when the account has none. It was previously dropped. A new account can read `""` for a moment right after its first login, until the backend records the address.
