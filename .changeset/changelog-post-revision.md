---
"@polyester/sdk": patch
---

Changelog post summaries add `revision` and `updatedAt`. A post can now be republished to correct its copy or withdraw a change: `revision` starts at 1 and increases with each republication, and `updatedAt` is when the current revision was published. To follow edits, read a post again when its `revision` changes. `listChanges` restarts paging at the first change of a post republished during the walk, so deduplicate changes by `id`.
