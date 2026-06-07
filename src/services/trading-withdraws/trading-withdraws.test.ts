import type { Transport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";
import { POLYESTER_TESTNET_ENVIRONMENT } from "../../environment.js";
import {
    TradingWithdrawsService,
    type TradingWithdrawWalletTypedData,
} from "./trading-withdraws.js";

function transportWithIntent(intentId: string): Transport {
    return {
        unary: vi.fn(async () => ({
            message: { intentId },
            header: new Headers(),
            trailer: new Headers(),
            stream: false,
            service: undefined,
            method: undefined,
        })),
        stream: vi.fn(),
    } as unknown as Transport;
}

describe("TradingWithdrawsService", () => {
    it("uses environment signing config for wallet typed data", async () => {
        let typedData: TradingWithdrawWalletTypedData | undefined;
        const service = new TradingWithdrawsService(transportWithIntent("intent-1"), undefined, {
            chainId: POLYESTER_TESTNET_ENVIRONMENT.chain.id,
            tradingGatewayAddress: POLYESTER_TESTNET_ENVIRONMENT.contracts.tradingGatewayAddress,
        });

        await expect(
            service.createToFunding({
                subaccountId: "2",
                assetId: 1,
                quantityScaled: 100n,
                destinationAddress: "funding",
                idempotencyKey: "withdraw-1",
                walletSigner: {
                    signerWallet: "0x1111111111111111111111111111111111111111",
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
    });
});
