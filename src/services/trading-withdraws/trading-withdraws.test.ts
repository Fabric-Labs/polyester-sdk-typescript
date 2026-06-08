import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import {
    TradingWithdrawsService,
    type TradingWithdrawWalletTypedData,
} from "./trading-withdraws.js";

type CapturedUnary = {
    method: string;
    signal: AbortSignal | undefined;
    headers: HeadersInit | undefined;
    message: Record<string, unknown>;
};

function transportWithResponses(
    responses: Record<string, Record<string, unknown>>,
    capture?: (call: CapturedUnary) => void,
): Transport {
    return {
        unary: vi.fn(
            async (
                method: { localName: string },
                signal: AbortSignal | undefined,
                _timeoutMs: number | undefined,
                headers: HeadersInit | undefined,
                message: Record<string, unknown>,
            ) => {
                capture?.({
                    method: method.localName,
                    signal,
                    headers,
                    message,
                });
                return {
                    message: responses[method.localName] ?? {},
                    header: new Headers(),
                    trailer: new Headers(),
                    stream: false,
                    service: undefined,
                    method: undefined,
                };
            },
        ),
        stream: vi.fn(),
    } as unknown as Transport;
}

const signingConfig = {
    chainId: POLYESTER_TESTNET_ENVIRONMENT.chain.id,
    tradingGatewayAddress: POLYESTER_TESTNET_ENVIRONMENT.contracts.tradingGatewayAddress,
};

describe("TradingWithdrawsService", () => {
    it("builds signed-payload withdraw requests and forwards mutation options", async () => {
        let captured: CapturedUnary | undefined;
        const controller = new AbortController();
        const payloadSignature = new Uint8Array([1, 2, 3]);
        const service = new TradingWithdrawsService(
            transportWithResponses(
                {
                    createTradingWithdraw: { intentId: "intent-1" },
                },
                (call) => {
                    captured = call;
                },
            ),
            undefined,
            signingConfig,
        );

        await expect(
            service.createToFunding(
                {
                    assetId: 1,
                    quantityScaled: "100",
                    destinationAddress: " funding ",
                    idempotencyKey: " withdraw-1 ",
                    payloadSignature,
                },
                { signal: controller.signal, stepUpToken: " fresh-token " },
            ),
        ).resolves.toEqual({ intentId: "intent-1" });

        const payload = captured?.message.payload as Proto.TradingWithdrawIntentPayload | undefined;
        expect(captured?.method).toBe("createTradingWithdraw");
        expect(captured?.signal).toBe(controller.signal);
        expect(new Headers(captured?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        expect(captured?.message.payloadSignature).toEqual(payloadSignature);
        expect(payload).toMatchObject({
            action: Proto.TradingWithdrawAction.TO_FUNDING,
            assetId: 1,
            destinationChainId: 0n,
            amountQ: { hi: 0n, lo: 100n },
            destinationAddress: "funding",
            idempotencyKey: "withdraw-1",
        });
        expect(payload?.deadlineTsSec).toBeGreaterThanOrEqual(
            BigInt(Math.floor(Date.now() / 1000)),
        );
        expect(payload?.nonce).toBeDefined();
    });

    it("uses environment signing config for wallet typed data and wallet requests", async () => {
        let typedData: TradingWithdrawWalletTypedData | undefined;
        let captured: CapturedUnary | undefined;
        const service = new TradingWithdrawsService(
            transportWithResponses(
                {
                    createWalletTradingWithdraw: { intentId: "intent-1" },
                },
                (call) => {
                    captured = call;
                },
            ),
            undefined,
            signingConfig,
        );

        await expect(
            service.createToFunding({
                subaccountId: "2",
                assetId: 1,
                quantityScaled: 100n,
                destinationAddress: "funding",
                idempotencyKey: "withdraw-1",
                walletSigner: {
                    signerWallet: " 0x1111111111111111111111111111111111111111 ",
                    accountId: "1",
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
            amountQ: 100n,
        });
        expect(captured?.method).toBe("createWalletTradingWithdraw");
        expect(captured?.message).toMatchObject({
            subaccountId: 2n,
            signerWallet: "0x1111111111111111111111111111111111111111",
            payloadSignature: new Uint8Array([0x12, 0x34]),
        });
    });

    it("rejects requests without either a wallet signer or payload signature before transport", async () => {
        const transport = transportWithResponses({});
        const service = new TradingWithdrawsService(transport, undefined, signingConfig);

        await expect(
            service.createToFunding({
                assetId: 1,
                quantityScaled: 100n,
                idempotencyKey: "withdraw-1",
            }),
        ).rejects.toThrow("Trading withdraw requires a wallet signer or payload signature.");
        expect(transport.unary).not.toHaveBeenCalled();
    });

    it("rejects malformed backend withdraw responses", async () => {
        const service = new TradingWithdrawsService(
            transportWithResponses({
                createTradingWithdraw: { intentId: "" },
            }),
            undefined,
            signingConfig,
        );

        await expect(
            service.createToFunding({
                assetId: 1,
                quantityScaled: 100n,
                idempotencyKey: "withdraw-1",
                payloadSignature: new Uint8Array([1]),
            }),
        ).rejects.toThrow();
    });
});
