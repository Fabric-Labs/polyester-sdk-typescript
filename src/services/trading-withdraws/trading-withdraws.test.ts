import { describe, expect, it, vi } from "vitest";
import { bytesToHex, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYESTER_DEVNET_ENVIRONMENT } from "../../environment.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { StepUpRequiredError } from "../../shared/errors.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";

const catalogTradingGatewayAddress = "0xD3fecf5D39131e23b6B0f872cA0a21c8A5a30932" as const;
import { unaryTransport, unaryTransportByMethod } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { TradingWithdrawsService, type TradingWithdrawWalletSigner } from "./trading-withdraws.js";

const signingConfig = {
    chainId: POLYESTER_DEVNET_ENVIRONMENT.chain.id,
    tradingGatewayAddress: POLYESTER_DEVNET_ENVIRONMENT.contracts.tradingGatewayAddress,
};

const validWalletSignature = `0x${"11".repeat(64)}1b` as const;

const usdc = {
    symbol: "USDC",
    ledgerId: 1,
    name: "USD Coin",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdc] });
    return createCatalogSdkScales(() => catalog);
}

describe("TradingWithdrawsService", () => {
    it("validates an external destination and forwards request options", async () => {
        const controller = new AbortController();
        const transport = unaryTransportByMethod({
            validateWithdrawDestination: {
                valid: true,
                code: Proto.WithdrawDestinationValidationCode.VALID,
                message: "Destination is valid.",
                canonicalDestinationAddress: "0xabc123",
            },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.validateDestination(
                {
                    destinationChainId: 10_009,
                    destinationAddress: " rAddress:123 ",
                },
                { signal: controller.signal },
            ),
        ).resolves.toEqual({
            valid: true,
            code: "valid",
            message: "Destination is valid.",
            canonicalDestinationAddress: "0xabc123",
        });

        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("validateWithdrawDestination");
        expect(captured?.message).toEqual({
            destinationChainId: 10_009n,
            destinationAddress: "rAddress:123",
        });
        expect(captured?.signal).toBe(controller.signal);
    });

    it("rejects malformed destination-validation responses", async () => {
        const transport = unaryTransportByMethod({
            validateWithdrawDestination: {
                valid: false,
                code: Proto.WithdrawDestinationValidationCode.VALID,
                message: "Inconsistent response.",
                canonicalDestinationAddress: "",
            },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.validateDestination({
                destinationChainId: 10_009,
                destinationAddress: "rAddress:123",
            }),
        ).rejects.toThrow();
    });

    it("builds signed-payload withdraw requests from decimal quantities and forwards mutation options", async () => {
        const controller = new AbortController();
        const payloadSignature = new Uint8Array([1, 2, 3]);
        const transport = unaryTransportByMethod({
            createTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding(
                {
                    assetId: 1,
                    quantity: "100",
                    destinationAddress: " funding ",
                    idempotencyKey: " withdraw-1 ",
                    payloadSignature,
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toEqual({ intentId: "intent-1" });

        const captured = transport.lastCall();
        const payload = (captured?.message as { payload?: Proto.TradingWithdrawIntentPayload })
            ?.payload;
        expect(captured?.method.localName).toBe("createTradingWithdraw");
        expect(captured?.signal).toBe(controller.signal);
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect((captured?.message as { payloadSignature?: Uint8Array })?.payloadSignature).toEqual(
            payloadSignature,
        );
        expect(payload).toMatchObject({
            action: Proto.TradingWithdrawAction.TO_FUNDING,
            assetId: 1,
            destinationChainId: 0n,
            // "100" at the E18 ledger scale (100e18 = 1e20, which overflows lo).
            amountE18: {
                hi: 100_000_000_000_000_000_000n >> 64n,
                lo: 100_000_000_000_000_000_000n & ((1n << 64n) - 1n),
            },
            destinationAddress: "funding",
            idempotencyKey: "withdraw-1",
        });
        expect(payload?.deadlineTsSec).toBeGreaterThanOrEqual(
            BigInt(Math.floor(Date.now() / 1000)),
        );
        expect(payload?.nonce).toBeDefined();
    });

    it("omits subaccountId for root-account wallet withdraws", async () => {
        let message: string | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding({
                account: "main",
                assetId: 1,
                quantity: "100",
                destinationAddress: " funding ",
                idempotencyKey: " withdraw-1 ",
                walletSigner: {
                    signerWallet: "0x1111111111111111111111111111111111111111",
                    accountId: formatId(1n),
                    signMessage: vi.fn(async (value): Promise<`0x${string}`> => {
                        message = value;
                        return validWalletSignature;
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-1" });

        expect(message).toContain("Action: TO_FUNDING\n");
        expect(message).toContain("Account ID: 1\nTarget Account ID: 1\n");
        expect(message).toContain("Destination Chain ID: 0\n");
        expect(message).toContain("Destination: funding\n");
        expect(message).toContain("Idempotency Key: withdraw-1");

        const captured = transport.lastCall();
        expect(captured?.message).not.toHaveProperty("subaccountId");
    });

    it("prefers catalog trading gateway metadata for wallet messages", async () => {
        let message: string | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const catalog = createTestCatalog({
            zipper: {
                chains: [],
                assets: [],
                contracts: [
                    {
                        name: "tradingGateway",
                        address: catalogTradingGatewayAddress,
                        type: "trading",
                        description: "",
                        version: 1,
                    },
                ],
                tsMs: 0,
            },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
            catalog,
        );

        await service.createToFunding({
            account: "main",
            assetId: 1,
            quantity: "100",
            idempotencyKey: "withdraw-1",
            walletSigner: {
                signerWallet: "0x1111111111111111111111111111111111111111",
                accountId: formatId(1n),
                signMessage: vi.fn(async (value): Promise<`0x${string}`> => {
                    message = value;
                    return validWalletSignature;
                }),
            },
        });

        expect(message).toContain(
            `Verifying Contract: ${catalogTradingGatewayAddress.toLowerCase()}\n`,
        );
    });

    it("uses environment signing config for wallet messages and wallet requests", async () => {
        let message: string | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding({
                account: { subaccountId: formatId(2n) },
                assetId: 1,
                quantity: "100",
                destinationAddress: "funding",
                idempotencyKey: "withdraw-1",
                walletSigner: {
                    signerWallet: " 0x1111111111111111111111111111111111111111 ",
                    accountId: formatId(1n),
                    signMessage: vi.fn(async (value): Promise<`0x${string}`> => {
                        message = value;
                        return validWalletSignature;
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-1" });

        expect(message).toContain("Environment: polyester\n");
        expect(message).toContain("Signer Wallet: 0x1111111111111111111111111111111111111111\n");
        expect(message).toContain("Target Account ID: 2\n");
        expect(message).toContain("Amount E18: 100000000000000000000\n");
        expect(message).toContain(`Polyester Chain ID: ${POLYESTER_DEVNET_ENVIRONMENT.chain.id}\n`);
        expect(message).toContain(
            `Verifying Contract: ${POLYESTER_DEVNET_ENVIRONMENT.contracts.tradingGatewayAddress.toLowerCase()}\n`,
        );
        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("createWalletTradingWithdraw");
        expect(captured?.message).toMatchObject({
            subaccountId: 2n,
            signerWallet: "0x1111111111111111111111111111111111111111",
            payloadSignature: new Uint8Array([...Array.from({ length: 64 }, () => 0x11), 0x1b]),
        });
    });

    it("signs the service message with EIP-191 and forwards the recoverable signature", async () => {
        const account = privateKeyToAccount(`0x${"00".repeat(31)}01`);
        let signedMessage: string | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await service.createToFunding({
            account: "main",
            assetId: 1,
            quantity: "100",
            destinationAddress: "funding",
            idempotencyKey: "withdraw-1",
            walletSigner: {
                signerWallet: account.address,
                accountId: formatId(1n),
                signMessage: async (message) => {
                    signedMessage = message;
                    return account.signMessage({ message });
                },
            },
        });

        const payloadSignature = (
            transport.lastCall()?.message as {
                payloadSignature?: Uint8Array;
            }
        )?.payloadSignature;
        expect(signedMessage).toBeDefined();
        expect(payloadSignature).toHaveLength(65);
        await expect(
            recoverMessageAddress({
                message: signedMessage!,
                signature: bytesToHex(payloadSignature!),
            }),
        ).resolves.toBe(account.address);
    });

    it("builds wallet-signed external-chain withdraw requests", async () => {
        let message: string | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-external-1" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToExternalChain({
                account: { subaccountId: formatId(2n) },
                assetId: 1,
                quantity: "1.25",
                destinationChainId: 10_009,
                destinationAddress: " rAddress:123 ",
                idempotencyKey: " withdraw-external-1 ",
                walletSigner: {
                    signerWallet: "0x1111111111111111111111111111111111111111",
                    accountId: formatId(1n),
                    signMessage: vi.fn(async (value): Promise<`0x${string}`> => {
                        message = value;
                        return validWalletSignature;
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-external-1" });

        expect(message).toContain("Action: TO_EXTERNAL_CHAIN\n");
        expect(message).toContain("Target Account ID: 2\n");
        expect(message).toContain("Destination Chain ID: 10009\n");
        expect(message).toContain("Amount E18: 1250000000000000000\n");
        expect(message).toContain("Destination: rAddress:123\n");
        expect(message).toContain("Idempotency Key: withdraw-external-1");

        const captured = transport.lastCall();
        const payload = (captured?.message as { payload?: Proto.TradingWithdrawIntentPayload })
            ?.payload;
        expect(captured?.method.localName).toBe("createWalletTradingWithdraw");
        expect(payload).toMatchObject({
            action: Proto.TradingWithdrawAction.TO_EXTERNAL_CHAIN,
            assetId: 1,
            destinationChainId: 10_009n,
            destinationAddress: "rAddress:123",
            idempotencyKey: "withdraw-external-1",
        });
    });

    it.each([
        {
            name: "Funding",
            prepare: (
                service: TradingWithdrawsService,
                signMessage: TradingWithdrawWalletSigner["signMessage"],
            ) =>
                service.prepareToFunding({
                    account: "main",
                    assetId: 1,
                    quantity: "10",
                    destinationAddress: "funding",
                    idempotencyKey: "withdraw-funding",
                    walletSigner: {
                        signerWallet: "0x1111111111111111111111111111111111111111",
                        accountId: formatId(1n),
                        signMessage,
                    },
                }),
        },
        {
            name: "external-chain",
            prepare: (
                service: TradingWithdrawsService,
                signMessage: TradingWithdrawWalletSigner["signMessage"],
            ) =>
                service.prepareToExternalChain({
                    account: "main",
                    assetId: 1,
                    quantity: "10",
                    destinationChainId: 10_009,
                    destinationAddress: "rAddress:123",
                    idempotencyKey: "withdraw-external",
                    walletSigner: {
                        signerWallet: "0x1111111111111111111111111111111111111111",
                        accountId: formatId(1n),
                        signMessage,
                    },
                }),
        },
    ])("replays the exact prepared $name wallet request after step-up", async ({ prepare }) => {
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw new StepUpRequiredError("Fresh verification required.");
            return { intentId: "intent-1" };
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );
        const signMessage = vi.fn(async (): Promise<`0x${string}`> => validWalletSignature);
        const prepared = await prepare(service, signMessage);

        await expect(prepared.submit()).rejects.toBeInstanceOf(StepUpRequiredError);
        await expect(prepared.submit({ stepUpToken: "fresh-token" })).resolves.toEqual({
            intentId: "intent-1",
        });

        expect(signMessage).toHaveBeenCalledOnce();
        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[1]?.message).toEqual(transport.calls[0]?.message);
        expect(new Headers(transport.calls[0]?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBeNull();
        expect(new Headers(transport.calls[1]?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh-token",
        );
    });

    it("rejects quantities that are invalid, non-positive, or too precise before transport", async () => {
        const transport = unaryTransportByMethod({});
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );
        const base = {
            assetId: 1,
            idempotencyKey: "withdraw-1",
            payloadSignature: new Uint8Array([1]),
        };

        await expect(
            service.createToFunding({ ...base, quantity: "not-a-number" }),
        ).rejects.toThrow(/quantity must be a non-negative decimal number/);
        await expect(service.createToFunding({ ...base, quantity: "0" })).rejects.toThrow(
            /quantity must be greater than 0/,
        );
        await expect(service.createToFunding({ ...base, quantity: "1.2345678" })).rejects.toThrow(
            /quantity supports at most 6 decimal places/,
        );
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("rejects requests without either a wallet signer or payload signature before transport", async () => {
        const transport = unaryTransportByMethod({});
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding({
                assetId: 1,
                quantity: "100",
                idempotencyKey: "withdraw-1",
            }),
        ).rejects.toThrow("Trading withdraw requires a wallet signer or payload signature.");
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: "embedded control in destination",
            destinationAddress: "funding\u0000",
        },
        { name: "line feed in destination", destinationAddress: "funding\nnext" },
        {
            name: "carriage return in destination",
            destinationAddress: "funding\rnext",
        },
        { name: "tab in destination", destinationAddress: "funding\tnext" },
        {
            name: "C1 control in destination",
            destinationAddress: "funding\u0085next",
        },
        {
            name: "unpaired surrogate in destination",
            destinationAddress: "funding\ud800",
        },
        {
            name: "embedded control in idempotency key",
            idempotencyKey: "withdraw\u0001",
        },
        { name: "line feed in idempotency key", idempotencyKey: "withdraw\nnext" },
        {
            name: "carriage return in idempotency key",
            idempotencyKey: "withdraw\rnext",
        },
        { name: "tab in idempotency key", idempotencyKey: "withdraw\tnext" },
        {
            name: "C1 control in idempotency key",
            idempotencyKey: "withdraw\u0085next",
        },
        {
            name: "unpaired surrogate in idempotency key",
            idempotencyKey: "withdraw\ud800",
        },
    ])(
        "rejects a wallet request with $name before signing or transport",
        async ({ name: _, ...input }) => {
            const transport = unaryTransportByMethod({});
            const signMessage = vi.fn(async (): Promise<`0x${string}`> => validWalletSignature);
            const service = new TradingWithdrawsService(
                { authApi: transport.transport },
                undefined,
                signingConfig,
                testScales(),
            );

            await expect(
                service.createToFunding({
                    account: "main",
                    assetId: 1,
                    quantity: "100",
                    destinationAddress: "funding",
                    idempotencyKey: "withdraw-1",
                    ...input,
                    walletSigner: {
                        signerWallet: "0x1111111111111111111111111111111111111111",
                        accountId: formatId(1n),
                        signMessage,
                    },
                }),
            ).rejects.toThrow(/valid UTF-8 without control characters/);

            expect(signMessage).not.toHaveBeenCalled();
            expect(transport.unary).not.toHaveBeenCalled();
        },
    );

    it.each([
        {
            name: "malformed signer wallet",
            signerWallet: "not-an-address",
            signature: validWalletSignature,
        },
        {
            name: "short signature",
            signerWallet: "0x1111111111111111111111111111111111111111",
            signature: "0x1234",
        },
        {
            name: "signature with invalid recovery id",
            signerWallet: "0x1111111111111111111111111111111111111111",
            signature: `0x${"11".repeat(64)}02`,
        },
    ])("rejects $name before transport", async ({ signerWallet, signature }) => {
        const transport = unaryTransportByMethod({});
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding({
                account: "main",
                assetId: 1,
                quantity: "100",
                idempotencyKey: "withdraw-1",
                walletSigner: {
                    signerWallet,
                    accountId: formatId(1n),
                    signMessage: vi.fn(
                        async (): Promise<`0x${string}`> => signature as `0x${string}`,
                    ),
                },
            }),
        ).rejects.toThrow();

        expect(transport.unary).not.toHaveBeenCalled();
    });

    it.each(["00", "01", "1b", "1c"])(
        "accepts a 65-byte wallet signature with recovery byte 0x%s",
        async (recoveryByte) => {
            const transport = unaryTransportByMethod({
                createWalletTradingWithdraw: { intentId: "intent-1" },
            });
            const service = new TradingWithdrawsService(
                { authApi: transport.transport },
                undefined,
                signingConfig,
                testScales(),
            );
            const signature = `0x${"11".repeat(64)}${recoveryByte}` as `0x${string}`;

            await expect(
                service.createToFunding({
                    account: "main",
                    assetId: 1,
                    quantity: "100",
                    idempotencyKey: "withdraw-1",
                    walletSigner: {
                        signerWallet: "0x1111111111111111111111111111111111111111",
                        accountId: formatId(1n),
                        signMessage: vi.fn(async (): Promise<`0x${string}`> => signature),
                    },
                }),
            ).resolves.toEqual({ intentId: "intent-1" });

            expect(
                (transport.lastCall()?.message as { payloadSignature?: Uint8Array })
                    ?.payloadSignature,
            ).toEqual(
                new Uint8Array([
                    ...Array.from({ length: 64 }, () => 0x11),
                    Number.parseInt(recoveryByte, 16),
                ]),
            );
        },
    );

    it("rejects malformed backend withdraw responses", async () => {
        const transport = unaryTransportByMethod({
            createTradingWithdraw: { intentId: "" },
        });
        const service = new TradingWithdrawsService(
            { authApi: transport.transport },
            undefined,
            signingConfig,
            testScales(),
        );

        await expect(
            service.createToFunding({
                assetId: 1,
                quantity: "100",
                idempotencyKey: "withdraw-1",
                payloadSignature: new Uint8Array([1]),
            }),
        ).rejects.toThrow();
    });
});
