---
"@polyester/sdk": minor
---

Add an `onPhase` timing hook to `sendPolyesterUserOperation` and `waitForPolyesterUserOperationReceipt` reporting `prepare`, `sign`, `send`, and `receipt` durations. Observer errors never affect the result.
