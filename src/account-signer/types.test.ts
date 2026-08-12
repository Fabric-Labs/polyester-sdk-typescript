import { describe, expect, it } from "vitest";
import type { AccountSigner } from "./types.js";
import { resolveAccountSigner } from "./types.js";
import { ConfigurationError } from "../shared/errors.js";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../environment.js";

const signer: AccountSigner = {
    environmentFingerprint: POLYESTER_TESTNET_ENVIRONMENT.fingerprint,
    accountAddress: "0x1111111111111111111111111111111111111111",
    ownerAddress: "0x2222222222222222222222222222222222222222",
    signMessage: async () => "0x1234",
};

describe("resolveAccountSigner", () => {
    it("rejects a malformed signer with an SDK configuration error", async () => {
        await expect(resolveAccountSigner("nonsense" as never)).rejects.toBeInstanceOf(
            ConfigurationError,
        );
    });

    it("returns null when no account signer is configured", async () => {
        await expect(resolveAccountSigner(undefined)).resolves.toBeNull();
    });

    it("returns a direct account signer", async () => {
        await expect(resolveAccountSigner(signer)).resolves.toBe(signer);
    });

    it("resolves a lazy account signer factory", async () => {
        await expect(resolveAccountSigner(() => signer)).resolves.toBe(signer);
        await expect(resolveAccountSigner(async () => signer)).resolves.toBe(signer);
    });

    it("rejects a signer without a valid account address", async () => {
        await expect(
            resolveAccountSigner({
                ...signer,
                accountAddress: "" as AccountSigner["accountAddress"],
            }),
        ).rejects.toThrow("Account signer must include a valid accountAddress.");
    });

    it("rejects a signer without an environment fingerprint", async () => {
        await expect(
            resolveAccountSigner({
                ...signer,
                environmentFingerprint: "",
            }),
        ).rejects.toThrow("Account signer must include an environmentFingerprint.");
    });
});
