---
"@polyester/sdk": minor
---

feat(errors): expose recognized backend rejections as typed `PolyesterError.detail` values, discriminated by service. `getOrderErrorDetail()` is removed; read `error.detail` instead.
