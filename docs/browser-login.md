# Browser Login

Polyester accounts are smart accounts. Bring an owner wallet or account, and the
SDK derives an account signer for the Polyester account without deploying
anything just to log in.

```ts
import {
    PolyesterBrowserClient,
    POLYESTER_TESTNET_ENVIRONMENT,
    createPolyesterAccountSigner,
} from "@polyester/sdk";

const accountSigner = createPolyesterAccountSigner({
    environment: POLYESTER_TESTNET_ENVIRONMENT,
    owner,
});
const client = new PolyesterBrowserClient({
    environment: POLYESTER_TESTNET_ENVIRONMENT,
    accountSigner,
});

await client.auth.login({ provider: "turnkey" });
```

The `accountSigner.accountAddress` is the Polyester account identity. The
optional `ownerAddress` is metadata about the wallet or custody provider that
controls it. Use `createPolyesterSmartAccount` separately for UserOperations and
other on-chain smart account interactions.
