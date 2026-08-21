---
"@polyester/sdk": minor
---

`sendPolyesterUserOperation` accepts a new `onWalletSignatureRequested` callback that fires right before the wallet is asked to sign, so UIs can show an accurate "confirm in your wallet" state.
