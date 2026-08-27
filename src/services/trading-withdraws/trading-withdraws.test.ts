import { describe, expect, it, vi } from "vitest";
import { keccak256, stringToBytes } from "viem";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { StepUpRequiredError } from "../../shared/errors.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";

const catalogTradingGatewayAddress = "0xD3fecf5D39131e23b6B0f872cA0a21c8A5a30932" as const;
import { unaryTransport, unaryTransportByMethod } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import {
    TradingWithdrawsService,
    type TradingWithdrawWalletSigner,
    type TradingWithdrawWalletTypedData,
} from "./trading-withdraws.js";

const signingConfig = {
    chainId: POLYESTER_TESTNET_ENVIRONMENT.chain.id,
    tradingGatewayAddress: POLYESTER_TESTNET_ENVIRONMENT.contracts.tradingGatewayAddress,
};

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
            transport.transport,
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
            transport.transport,
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
            transport.transport,
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
        let typedData: TradingWithdrawWalletTypedData | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            transport.transport,
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
                    signTypedData: vi.fn(async (value): Promise<`0x${string}`> => {
                        typedData = value;
                        return "0x1234";
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-1" });

        expect(typedData?.message).toMatchObject({
            accountId: 1n,
            targetAccountId: 1n,
            destinationChainId: 0n,
            destinationHash: keccak256(stringToBytes("funding")),
            idempotencyKeyHash: keccak256(stringToBytes("withdraw-1")),
        });

        const captured = transport.lastCall();
        expect(captured?.message).not.toHaveProperty("subaccountId");
    });

    it("prefers catalog trading gateway metadata for wallet typed data", async () => {
        let typedData: TradingWithdrawWalletTypedData | undefined;
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
            transport.transport,
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
                signTypedData: vi.fn(async (value): Promise<`0x${string}`> => {
                    typedData = value;
                    return "0x1234";
                }),
            },
        });

        expect(typedData?.domain.verifyingContract).toBe(catalogTradingGatewayAddress);
    });

    it("uses environment signing config for wallet typed data and wallet requests", async () => {
        let typedData: TradingWithdrawWalletTypedData | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-1" },
        });
        const service = new TradingWithdrawsService(
            transport.transport,
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
                    signTypedData: vi.fn(async (value): Promise<`0x${string}`> => {
                        typedData = value;
                        return "0x1234";
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-1" });

        expect(typedData?.domain.chainId).toBe(POLYESTER_TESTNET_ENVIRONMENT.chain.id);
        expect(typedData?.domain.verifyingContract).toBe(
            POLYESTER_TESTNET_ENVIRONMENT.contracts.tradingGatewayAddress,
        );
        expect(typedData?.message).toMatchObject({
            signerWallet: "0x1111111111111111111111111111111111111111",
            actionType: Proto.TradingWithdrawAction.TO_FUNDING,
            accountId: 1n,
            targetAccountId: 2n,
            assetId: 1,
            destinationChainId: 0n,
            // EIP-712 field is amountQ; value is ledger E18 scale (proto amount_e18).
            amountQ: 100_000_000_000_000_000_000n,
        });
        const captured = transport.lastCall();
        expect(captured?.method.localName).toBe("createWalletTradingWithdraw");
        expect(captured?.message).toMatchObject({
            subaccountId: 2n,
            signerWallet: "0x1111111111111111111111111111111111111111",
            payloadSignature: new Uint8Array([0x12, 0x34]),
        });
    });

    it("builds wallet-signed external-chain withdraw requests", async () => {
        let typedData: TradingWithdrawWalletTypedData | undefined;
        const transport = unaryTransportByMethod({
            createWalletTradingWithdraw: { intentId: "intent-external-1" },
        });
        const service = new TradingWithdrawsService(
            transport.transport,
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
                    signTypedData: vi.fn(async (value): Promise<`0x${string}`> => {
                        typedData = value;
                        return "0x1234";
                    }),
                },
            }),
        ).resolves.toEqual({ intentId: "intent-external-1" });

        expect(typedData?.message).toMatchObject({
            actionType: Proto.TradingWithdrawAction.TO_EXTERNAL_CHAIN,
            targetAccountId: 2n,
            assetId: 1,
            destinationChainId: 10_009n,
            amountQ: 1_250_000_000_000_000_000n,
            destinationHash: keccak256(stringToBytes("rAddress:123")),
            idempotencyKeyHash: keccak256(stringToBytes("withdraw-external-1")),
        });

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
                signTypedData: TradingWithdrawWalletSigner["signTypedData"],
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
                        signTypedData,
                    },
                }),
        },
        {
            name: "external-chain",
            prepare: (
                service: TradingWithdrawsService,
                signTypedData: TradingWithdrawWalletSigner["signTypedData"],
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
                        signTypedData,
                    },
                }),
        },
    ])("replays the exact prepared $name wallet request after step-up", async ({ prepare }) => {
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw new StepUpRequiredError("Fresh verification required.");
            return { intentId: "intent-1" };
        });
        const service = new TradingWithdrawsService(
            transport.transport,
            undefined,
            signingConfig,
            testScales(),
        );
        const signTypedData = vi.fn(async (): Promise<`0x${string}`> => "0x1234");
        const prepared = await prepare(service, signTypedData);

        await expect(prepared.submit()).rejects.toBeInstanceOf(StepUpRequiredError);
        await expect(prepared.submit({ stepUpToken: "fresh-token" })).resolves.toEqual({
            intentId: "intent-1",
        });

        expect(signTypedData).toHaveBeenCalledOnce();
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
            transport.transport,
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
            transport.transport,
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

    it("rejects malformed backend withdraw responses", async () => {
        const transport = unaryTransportByMethod({
            createTradingWithdraw: { intentId: "" },
        });
        const service = new TradingWithdrawsService(
            transport.transport,
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
