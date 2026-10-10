---
"@polyester/sdk": patch
---

Decode market trade, user fill, ledger transfer, and trigger event subscriptions as the batched publications the realtime channels now send, and emit each event in order through the existing `onEvent`. Previously a batch decoded as a single event, dropping or zeroing the rest, or failed with a decode error. A malformed event is reported through `onError` without dropping the rest of its batch. `LedgerTransfer` adds `transferId`, an unsigned 128-bit decimal string shared by both legs of a transfer, and `TriggerEvent` adds the exact `tsNs`, so subscribers can replace repeated events by their identity.
