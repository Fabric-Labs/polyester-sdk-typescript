---
"@polyester/sdk": patch
---

`triggers.fromProto(trigger)` converts a `triggers.v1.Trigger` message received from another API into the same `Trigger` record that `triggers.get`, `list`, and `subscribe` return, with quantities and prices scaled by the client's catalog. It waits for the catalog and throws when the trigger's market isn't in it.
