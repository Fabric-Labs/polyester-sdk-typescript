import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../environment.js";
import { createPolyesterAccountSigner } from "./create-polyester-account-signer.js";
import { predictSafeAddress } from "./predict-safe-address.js";

const owner = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
);

describe("createPolyesterAccountSigner", () => {
    it("returns a deterministic account address and owner metadata for an environment", () => {
        const accountSigner = createPolyesterAccountSigner({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            owner,
            saltNonce: 7n,
        });
        const {
            safeProxyFactoryAddress,
            safeSingletonAddress,
            safeModuleSetupAddress,
            safe4337ModuleAddress,
            multiSendAddress,
        } = POLYESTER_TESTNET_ENVIRONMENT.accountAbstraction.safe;

        expect(accountSigner.accountAddress).toBe(
            predictSafeAddress({
                owners: [owner.address],
                saltNonce: 7n,
                safeProxyFactoryAddress,
                safeSingletonAddress,
                safeModuleSetupAddress,
                safe4337ModuleAddress,
                multiSendAddress,
            }),
        );
        expect(accountSigner.environmentFingerprint).toBe(
            POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
        );
        expect(accountSigner.ownerAddress).toBe(owner.address);
    });

    it("returns ERC-6492 wrapped signatures for login messages", async () => {
        const accountSigner = createPolyesterAccountSigner({
            environment: POLYESTER_TESTNET_ENVIRONMENT,
            owner,
        });
        const signature = await accountSigner.signMessage("Polyester Login\n\nNonce: test");

        expect(signature).toMatch(/^0x[0-9a-f]+$/iu);
        expect(
            signature.endsWith("6492649264926492649264926492649264926492649264926492649264926492"),
        ).toBe(true);
    });
});
