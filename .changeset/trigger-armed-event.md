---
"@polyester/sdk": minor
---

Trigger events decode the new `"armed"` event type: an attached take-profit, stop-loss or trailing-stop leg reports it once, when its parent order's first fill makes the leg live (or when a leg paused before that fill resumes). It is not terminal. `listEvents` also accepts `eventType: "armed"` as a filter. Attached trailing stops still report `"activated"` when they start tracking.
