---
"@polyester/sdk": patch
---

Declare the Multicall3 deployment (`0xF35A6AE5408fa1356064849D0BC3855f801aa6aC`, block 563457) on the Polychain testnet chain definition so viem clients can batch contract reads via multicall instead of issuing one `eth_call` per read.
