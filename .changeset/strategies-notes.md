---
"@polyester/sdk": patch
---

`strategies` adds `getNotes`, `saveNotes` and `listNotesRevisions` for a strategy's notes, a one-line summary and a Markdown body saved as revisions; a stale `expectedNotesRevision` throws `RevisionConflictError` (`NOTES_REVISION_CONFLICT`). `saveDraftVersion` takes an optional `expectedNotesRevision` to save the draft only against the notes it was written with.
