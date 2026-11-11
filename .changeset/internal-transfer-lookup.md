---
"@polyester/sdk": patch
---

`internalTransfers.get({ requestId } | { transferId })` reads an accepted transfer of the resolved source account and returns `requestId`, `transferId`, `flowId`, `acceptedAtUnixMs` and the exact `acceptedAtNs` as a decimal string. `internalTransfers.create` results also carry `flowId`. Use them to reconcile a transfer without resubmitting it, and pass `flowId` to `lifecycle.getFlow`. Pass exactly one identifier. An unknown, pending or inaccessible transfer is a `ResourceNotFoundError`. The read needs a session JWT; API keys are refused.
