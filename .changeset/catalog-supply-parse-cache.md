---
"@polyester/sdk": patch
---

`patchZipperCatalogSupply` caches the snapshot it returns as already validated, so passing it to `catalog.setSnapshot` no longer re-validates the whole catalog on every supply update.
