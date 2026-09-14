import { describe, expect, it } from "vitest";
import { hashMessage, stringToBytes } from "viem";
import { TradingWithdrawAction } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { buildTradingWithdrawWalletMessage } from "./wallet-message.js";

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
