---
"@polyester/sdk": minor
---

fix(social-verification)!: omit `handle` when starting Discord verification; the authenticated bot supplies the identity. Remove `handle` from Discord `start()` inputs. Omitted `method` now uses the provider default: Twitter profile or Discord channel.
