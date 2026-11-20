import { describe, expect, it } from "vitest";
import { hashMessage, stringToBytes } from "viem";
import { TradingWithdrawAction } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { privateKeyToAccount } from "viem/accounts";
import {
    buildTradingToFundingBatchWalletMessage,
    buildTradingWithdrawWalletMessage,
} from "./wallet-message.js";

const funding: Parameters<typeof buildTradingWithdrawWalletMessage>[0] = {
    signingConfig: {
        chainId: 888168,
        tradingGatewayAddress: "0x1111111111111111111111111111111111111111",
    },
    signerWallet: " 0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa ",
    accountId: 1001n,
    targetAccountId: 2002n,
    payload: {
        action: TradingWithdrawAction.TO_FUNDING,
        assetId: 42,
        destinationChainId: 0n,
        amountE18: { hi: 0n, lo: 1000000000000000000n },
        destinationAddress: " 0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb ",
        deadlineTsSec: 1900000000n,
        nonce: { hi: 1n, lo: 100n },
        idempotencyKey: " transfer-0001 ",
    },
};

// Exact format vectors supplied by the backend in the POLY-4554 signing contract.
const fundingMessage = `Polyester Trading Withdrawal

Version: 1
Environment: polyester
Action: TO_FUNDING
Signer Wallet: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Account ID: 1001
Target Account ID: 2002
Asset ID: 42
Polyester Chain ID: 888168
Destination Chain ID: 0
Amount E18: 1000000000000000000
Destination: 0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb
Verifying Contract: 0x1111111111111111111111111111111111111111
Deadline: 1900000000
Nonce: 18446744073709551716
Idempotency Key: transfer-0001`;

const externalMessage = `Polyester Trading Withdrawal

Version: 1
Environment: polyester
Action: TO_EXTERNAL_CHAIN
Signer Wallet: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Account ID: 1001
Target Account ID: 2002
Asset ID: 42
Polyester Chain ID: 888168
Destination Chain ID: 8453
Amount E18: 1000000000000000000
Destination: 0x2222222222222222222222222222222222222222
Verifying Contract: 0x1111111111111111111111111111111111111111
Deadline: 1900000000
Nonce: 18446744073709551715
Idempotency Key: withdraw-0001`;

describe("wallet trading withdraw message", () => {
    it("matches the backend Funding UTF-8 vector exactly", () => {
        expect(stringToBytes(buildTradingWithdrawWalletMessage(funding))).toEqual(
            stringToBytes(fundingMessage),
        );
    });

    it("matches the backend external-chain UTF-8 vector exactly", () => {
        const message = buildTradingWithdrawWalletMessage({
            ...funding,
            payload: {
                ...funding.payload,
                action: TradingWithdrawAction.TO_EXTERNAL_CHAIN,
                destinationChainId: 8453n,
                destinationAddress: "0x2222222222222222222222222222222222222222",
                nonce: { hi: 1n, lo: 99n },
                idempotencyKey: "withdraw-0001",
            },
        });
        expect(stringToBytes(message)).toEqual(stringToBytes(externalMessage));
    });

    it("retains the space for an empty destination and lowercases the verifying contract", () => {
        const message = buildTradingWithdrawWalletMessage({
            ...funding,
            signingConfig: {
                ...funding.signingConfig,
                tradingGatewayAddress:
                    " 0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb " as `0x${string}`,
            },
            payload: { ...funding.payload, destinationAddress: "" },
        });
        expect(message).toContain(
            "Destination: \nVerifying Contract: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
        );
    });

    it("formats full-width unsigned values without precision loss", () => {
        const max64 = (1n << 64n) - 1n;
        const message = buildTradingWithdrawWalletMessage({
            ...funding,
            accountId: max64,
            targetAccountId: max64,
            payload: {
                ...funding.payload,
                amountE18: { hi: max64, lo: max64 },
                nonce: { hi: max64, lo: max64 },
            },
        });
        expect(message).toContain("Account ID: 18446744073709551615\n");
        expect(message).toContain("Target Account ID: 18446744073709551615\n");
        expect(message).toContain("Amount E18: 340282366920938463463374607431768211455\n");
        expect(message).toContain("Nonce: 340282366920938463463374607431768211455\n");
    });

    it.each([
        ["destinationAddress", "line feed", "0xabc\nNonce: 1"],
        ["destinationAddress", "right-to-left override", "0xabc\u202Edef"],
        ["destinationAddress", "line separator", "0xabc\u2028Nonce: 1"],
        ["destinationAddress", "paragraph separator", "0xabc\u2029Nonce: 1"],
        ["idempotencyKey", "zero-width no-break space", "k\uFEFF1"],
        ["idempotencyKey", "zero-width space", "k\u200B1"],
    ])("rejects a %s containing a %s", (field, _label, value) => {
        expect(() =>
            buildTradingWithdrawWalletMessage({
                ...funding,
                payload: { ...funding.payload, [field]: value },
            }),
        ).toThrow(/valid UTF-8 without control characters/);
    });

    it.each<[string, Partial<typeof funding>]>([
        ["signer wallet", { signerWallet: "0x1111111111111111111111111111111111111111" }],
        ["root account", { accountId: 1002n }],
        ["target account", { targetAccountId: 2003n }],
        ["Polyester chain", { signingConfig: { ...funding.signingConfig, chainId: 888169 } }],
        [
            "verifying contract",
            {
                signingConfig: {
                    ...funding.signingConfig,
                    tradingGatewayAddress: "0x2222222222222222222222222222222222222222",
                },
            },
        ],
        ...Object.entries({
            action: TradingWithdrawAction.TO_EXTERNAL_CHAIN,
            assetId: 43,
            destinationChainId: 8453n,
            amountE18: { hi: 1n, lo: 1000000000000000000n },
            destinationAddress: "different-destination",
            deadlineTsSec: 1900000001n,
            nonce: { hi: 2n, lo: 100n },
            idempotencyKey: "transfer-0002",
        }).map(([field, value]): [string, Partial<typeof funding>] => [
            field,
            { payload: { ...funding.payload, [field]: value } },
        ]),
    ])("binds %s to the personal-sign digest", (_field, changes) => {
        const changed = buildTradingWithdrawWalletMessage({
            ...funding,
            ...changes,
        });
        expect(hashMessage(changed)).not.toBe(hashMessage(fundingMessage));
    });
});

describe("buildTradingToFundingBatchWalletMessage", () => {
    // Golden vector from the chain.withdraw.v1 2026-11-18T1926Z contract change.
    const batchMessage = `Polyester Trading Withdrawal Batch

Version: 1
Environment: polyester
Action: TO_FUNDING
Signer Wallet: 0x2c7536e3605d9c16a7a3d7b1898e529396a65c23
Account ID: 1001
Target Account ID: 2002
Polyester Chain ID: 31337
Verifying Contract: 0x1111111111111111111111111111111111111111
Deadline: 1900000000
Nonce: 18446744073709551716
Idempotency Key: bulk-0001
Legs: 2

Leg 1 of 2
Asset ID: 42
Amount E18: 1000000000
Destination: 

Leg 2 of 2
Asset ID: 7
Amount E18: 500000000000000000
Destination: 0x2222222222222222222222222222222222222222`;

    it("matches the backend golden vector, text and signature", async () => {
        const message = buildTradingToFundingBatchWalletMessage({
            signingConfig: {
                chainId: 31337,
                tradingGatewayAddress: "0x1111111111111111111111111111111111111111",
            },
            signerWallet: "0x2C7536E3605D9C16a7a3D7b1898e529396a65c23",
            accountId: 1001n,
            targetAccountId: 2002n,
            deadlineTsSec: 1900000000n,
            nonce: 18446744073709551716n,
            idempotencyKey: "bulk-0001",
            legs: [
                { assetId: 42, amountE18: 1000000000n, destinationAddress: "" },
                {
                    assetId: 7,
                    amountE18: 500000000000000000n,
                    destinationAddress: "0x2222222222222222222222222222222222222222",
                },
            ],
        });
        expect(message).toBe(batchMessage);
        const account = privateKeyToAccount(
            "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
        );
        await expect(account.signMessage({ message })).resolves.toBe(
            "0xa6aef9e82b6029c93fba8e8c682fc4012e3cc9b741e62e007405b49a53e850491ffd662ed011412565cf1b5a9ea808a905f660647f5063e13d7692f57980e2851c",
        );
    });

    it("keeps a destination's letter case", () => {
        const message = buildTradingToFundingBatchWalletMessage({
            signingConfig: funding.signingConfig,
            signerWallet: funding.signerWallet,
            accountId: 1n,
            targetAccountId: 1n,
            deadlineTsSec: 1n,
            nonce: 1n,
            idempotencyKey: "k",
            legs: [
                {
                    assetId: 1,
                    amountE18: 1n,
                    destinationAddress: "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb",
                },
            ],
        });
        expect(message.endsWith("Destination: 0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb")).toBe(
            true,
        );
    });
});
