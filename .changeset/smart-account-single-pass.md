---
"@polyester/sdk": minor
---

`sendPolyesterUserOperation` now prepares the operation in a single pass, halving the network round-trips before the wallet signature prompt appears. Gas estimation errors now propagate instead of triggering a silent resend.
