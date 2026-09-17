import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createPolyesterEnvironment, POLYESTER_DEVNET_ENVIRONMENT } from "../environment.js";
import { createPolyesterAccountSigner } from "./create-polyester-account-signer.js";
import { predictSafeAddress } from "./predict-safe-address.js";

const owner = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
);

describe("createPolyesterAccountSigner", () => {
    it("returns a deterministic account address and owner metadata for an environment", () => {
        const accountSigner = createPolyesterAccountSigner({
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            owner,
            saltNonce: 7n,
        });
        const {
            safeProxyFactoryAddress,
            safeSingletonAddress,
            safeModuleSetupAddress,
            safe4337ModuleAddress,
            multiSendAddress,
        } = POLYESTER_DEVNET_ENVIRONMENT.accountAbstraction.safe;

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
        expect(accountSigner.environmentFingerprint).toBe(POLYESTER_DEVNET_ENVIRONMENT.fingerprint);
        expect(accountSigner.ownerAddress).toBe(owner.address);
    });

    it("keeps signer identity across global and regional gateways", () => {
        const regional = createPolyesterEnvironment({
            ...POLYESTER_DEVNET_ENVIRONMENT,
            apiUrl: "https://iad.api.devnet.polyester.com",
            websocketUrl: "wss://iad.api.devnet.polyester.com",
        });
        const globalSigner = createPolyesterAccountSigner({
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            owner,
        });
        const regionalSigner = createPolyesterAccountSigner({ environment: regional, owner });
        expect(globalSigner.environmentFingerprint).toBe(regional.fingerprint);
        expect(regionalSigner.environmentFingerprint).toBe(globalSigner.environmentFingerprint);
        expect(regionalSigner.accountAddress).toBe(globalSigner.accountAddress);
    });

    it("returns ERC-6492 wrapped signatures for login messages", async () => {
        const accountSigner = createPolyesterAccountSigner({
            environment: POLYESTER_DEVNET_ENVIRONMENT,
            owner,
        });
        const signature = await accountSigner.signMessage("Polyester Login\n\nNonce: test");

        expect(signature).toMatch(/^0x[0-9a-f]+$/iu);
        expect(
            signature.endsWith("6492649264926492649264926492649264926492649264926492649264926492"),
        ).toBe(true);
    });
});
