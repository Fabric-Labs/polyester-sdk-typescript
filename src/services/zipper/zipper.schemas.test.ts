import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { DepositWithdrawConfigSchema } from "./zipper.schemas.js";

describe("DepositWithdrawConfigSchema", () => {
    it("normalizes generated zipper config defaults", () => {
        const config = v.parse(DepositWithdrawConfigSchema, {
            chains: [
                {
                    chainId: 8453,
                    code: "BASE",
                    name: "Base",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://basescan.org",
                    icon: "base.svg",
                    requiredConfirmations: 12,
                    confirmationTimeSeconds: 2,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [
                {
                    asset: "USDT",
                    ledgerId: 1,
                    name: "Tether USD",
                    icon: "usdt.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 6,
                    variants: [
                        {
                            chainAssetId: 1001,
                            chainId: 8453,
                            sourceAddress: "0x0000000000000000000000000000000000000001",
                            ztokenAddress: "0x0000000000000000000000000000000000000002",
                        },
                    ],
                },
            ],
            tsSec: 1_700_000_000n,
            polyesterChainId: 1,
        });

        expect(config).toEqual({
            chains: [
                {
                    chainId: 8453,
                    code: "BASE",
                    name: "Base",
                    nativeChainId: "",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://basescan.org",
                    icon: "base.svg",
                    requiredConfirmations: 12,
                    confirmationTimeSeconds: 2,
                    isCaseSensitive: false,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [
                {
                    asset: "USDT",
                    ledgerId: 1,
                    name: "Tether USD",
                    icon: "usdt.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 6,
                    variants: [
                        {
                            chainAssetId: 1001,
                            chainId: 8453,
                            isNativeAsset: false,
                            networkFee: "0",
                            networkFeeTsSec: 0,
                            depositMinAmount: "",
                            withdrawMinAmount: "",
                            sourceToken: {
                                address: "0x0000000000000000000000000000000000000001",
                                decimals: 18,
                            },
                            zToken: {
                                address: "0x0000000000000000000000000000000000000002",
                                decimals: 18,
                            },
                        },
                    ],
                    uAssetId: "",
                },
            ],
            polyesterChainId: 1,
            contracts: [],
            tsMs: 1_700_000_000_000,
        });
    });

    it("requires bigint snapshot timestamps", () => {
        expect(() =>
            v.parse(DepositWithdrawConfigSchema, {
                chains: [],
                assets: [],
                tsSec: 1_700_000_000,
                polyesterChainId: 1,
            }),
        ).toThrow();
    });
});
