---
"@polyester/sdk": minor
---

fix(social-verification)!: omit `handle` when starting Discord verification; the authenticated bot supplies the identity. Remove `handle` from Discord `start()` inputs. `method` is now provider-specific: Twitter accepts only `"profile"`, Discord accepts `"channel"` or `"dm"`. Omitted `method` uses the provider default: Twitter profile or Discord channel.
