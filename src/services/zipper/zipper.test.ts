import { unaryTransport } from "../../testing/service-harness.js";
import { describe, expect, it } from "vitest";
import { ZipperService } from "./zipper.js";

describe("ZipperService", () => {
    it("parses deposit/withdraw config and propagates read call options", async () => {
        const transport = unaryTransport({
            chains: [
                {
                    chainId: 8453,
                    code: "base",
                    name: "Base",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://basescan.org",
                    icon: "base.svg",
                    requiredConfirmations: 2,
                    confirmationTimeSeconds: 4,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [
                {
                    asset: "USDC",
                    ledgerId: 1,
                    name: "USD Coin",
                    icon: "usdc.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 2,
                    variants: [
                        {
                            chainAssetId: 100,
                            chainId: 8453,
                            isNativeAsset: false,
                            networkFee: "0.25",
                            networkFeeTsSec: 10n,
                            sourceAddress: "0x1111111111111111111111111111111111111111",
                            sourceDecimals: 6,
                            ztokenAddress: "0x2222222222222222222222222222222222222222",
                            ztokenDecimals: 18,
                            depositMinAmount: "1",
                            withdrawMinAmount: "2",
                        },
                    ],
                },
            ],
            contracts: [{ name: "Gateway", address: "0x3333333333333333333333333333333333333333" }],
            tsSec: 100n,
            polyesterChainId: 77,
        });
        const service = new ZipperService(transport.transport);
        const signal = new AbortController().signal;

        await expect(service.getDepositWithdrawConfig({ signal })).resolves.toMatchObject({
            tsMs: 100000,
            polyesterChainId: 77,
            chains: [{ chainId: 8453, nativeChainId: "", isCaseSensitive: false }],
            assets: [
                {
                    asset: "USDC",
                    variants: [
                        {
                            chainAssetId: 100,
                            networkFeeTsSec: 10,
                            sourceToken: {
                                address: "0x1111111111111111111111111111111111111111",
                                decimals: 6,
                            },
                            zToken: {
                                address: "0x2222222222222222222222222222222222222222",
                                decimals: 18,
                            },
                        },
                    ],
                },
            ],
            contracts: [
                {
                    name: "Gateway",
                    address: "0x3333333333333333333333333333333333333333",
                    type: "",
                    description: "",
                    version: 0,
                },
            ],
        });
        expect(transport.lastCall()?.message).toEqual({});
        expect(transport.lastCall()?.signal).toBe(signal);
    });
});
