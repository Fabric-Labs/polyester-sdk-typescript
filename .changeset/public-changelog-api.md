---
"@polyester/sdk": patch
---

Add `changelog`, a public reader for the environment's product changelog: `listPosts`, `getPost({ slug })` and `listChanges`, which filters changes by category, audience, surface and time. The generated protobufs are exported as `changelogPb`.
