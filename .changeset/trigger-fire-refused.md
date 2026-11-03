---
"@polyester/sdk": patch
---

Trigger events add the `"fire_refused"` event type: a fire was refused and the trigger stayed live, so it is not terminal. The event's `fireRefusalReason` says why, using the trigger failure reason labels. `listEvents` accepts `eventType: "fire_refused"` as a filter, and trigger failure reasons add `account_repairing`.
