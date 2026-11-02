---
"@polyester/sdk": patch
---

Add `changelog`, a public, unauthenticated reader for the product changelog of the environment the client calls. `changelog.listPosts({ limit, pageToken })` returns post summaries newest first with change counts by kind; `changelog.getPost({ slug })` returns one post with its sections and changes; `changelog.listChanges({ categories, actionRequired, surfaces, audiences, startTime, endTime, postSlug, sort, limit, pageToken })` returns individual changes across posts with the announcing post's slug, publication time and section heading. Requests go over cacheable GET. Times are epoch milliseconds; `endTime` before or equal to `startTime`, an empty slug, or a `limit` above 100 (posts) or 500 (changes) throws `ValidationError` before the request. Change ids are base58 strings, and enum values the SDK does not know decode as `"unspecified"`. The generated protobufs are exported from `@polyester/sdk/unstable/gen` as `changelogPb`.
