---
"@polyester/sdk": patch
---

`createApiKeyEd25519AuthHeaders` now builds the same canonical string as the server's API-key verifier, so requests with escaped or unusual URLs stop failing signature checks. It signs the upper-cased method and the percent-decoded path, sorts query pairs by their decoded bytes (key, then value), and escapes everything outside `A-Z a-z 0-9 - . _ ~`, keeping bytes that are not UTF-8. The tests pin the signing vectors shared with the Go, Python and Rust SDKs.
