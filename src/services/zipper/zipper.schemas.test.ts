import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { MemoRequirement, RouteStatus, SupplyStatus } from "../../gen/chain/zipper/v1/zipper_pb.js";
import { DepositWithdrawConfigSchema, ZipperChainConfigSchema } from "./zipper.schemas.js";

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
                            zippedAssetId: 1001,
                            chainId: 8453,
                            sourceAddress: "0x0000000000000000000000000000000000000001",
                            ztokenAddress: "0x0000000000000000000000000000000000000002",
                            supplyQ: 123_456_789n,
                        },
                    ],
                },
            ],
            tsSec: 1_700_000_000n,
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
                    memoRequirement: "unspecified",
                    memoLabel: "",
                    memoFormatHint: "",
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
                            zippedAssetId: 1001,
                            chainId: 8453,
                            isNativeAsset: false,
                            networkFee: "0",
                            networkFeeTsSec: 0,
                            depositMinAmount: "",
                            withdrawMinAmount: "",
                            depositStatus: "unspecified",
                            withdrawalStatus: "unspecified",
                            supplyStatus: "unspecified",
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
            }),
        ).toThrow();
    });

    it.each([
        [MemoRequirement.REQUIRED, "required"],
        [MemoRequirement.OPTIONAL, "optional"],
        [MemoRequirement.NOT_SUPPORTED, "not_supported"],
        [99, "unspecified"],
    ] as const)("decodes memo requirement %i as %s", (memoRequirement, label) => {
        const chain = v.parse(ZipperChainConfigSchema, {
            chainId: 144,
            code: "XRP",
            name: "XRP Ledger",
            nativeCurrencySymbol: "XRP",
            explorerUrl: "https://livenet.xrpl.org",
            icon: "xrp.svg",
            requiredConfirmations: 1,
            confirmationTimeSeconds: 4,
            minAddressLength: 25,
            maxAddressLength: 35,
            memoRequirement,
            memoLabel: "Destination tag",
            memoFormatHint: "Up to 10 digits",
        });

        expect(chain).toMatchObject({
            memoRequirement: label,
            memoLabel: "Destination tag",
            memoFormatHint: "Up to 10 digits",
        });
    });

    it("decodes deposit and withdrawal route status per variant", () => {
        const config = v.parse(DepositWithdrawConfigSchema, {
            chains: [],
            assets: [
                {
                    asset: "SOL",
                    ledgerId: 5,
                    name: "Solana",
                    icon: "sol.svg",
                    quantityScale: 9,
                    quantityDisplayDecimals: 4,
                    variants: [
                        {
                            zippedAssetId: 2001,
                            chainId: 101,
                            depositStatus: RouteStatus.SUSPENDED,
                            withdrawalStatus: RouteStatus.NORMAL,
                        },
                        { zippedAssetId: 2002, chainId: 102, depositStatus: 99 },
                    ],
                },
            ],
            tsSec: 1_700_000_000n,
        });

        expect(config.assets[0]?.variants).toMatchObject([
            { depositStatus: "suspended", withdrawalStatus: "normal" },
            { depositStatus: "unspecified", withdrawalStatus: "unspecified" },
        ]);
    });

    it("gives a supply only while it is available or stale, never zero for an unknown one", () => {
        const variant = (supplyStatus: number, supplyQ = 0n) => ({
            zippedAssetId: 3000 + supplyStatus,
            chainId: 1,
            supplyQ,
            supplyStatus,
            ...(supplyQ > 0n && { supplyObservedAt: { seconds: 1_700_000_000n } }),
        });
        const config = v.parse(DepositWithdrawConfigSchema, {
            chains: [],
            assets: [
                {
                    asset: "USDT",
                    ledgerId: 1,
                    name: "Tether USD",
                    icon: "usdt.svg",
                    quantityScale: 6,
                    quantityDisplayDecimals: 6,
                    variants: [
                        variant(SupplyStatus.AVAILABLE),
                        variant(SupplyStatus.STALE, 1_500_000n),
                        variant(SupplyStatus.MISSING),
                        variant(SupplyStatus.SUPPLY_UNSPECIFIED),
                    ],
                },
            ],
            tsSec: 1_700_000_000n,
        });

        const variants = config.assets[0]?.variants;
        expect(variants?.[0]).toMatchObject({ supplyStatus: "available", supply: "0" });
        expect(variants?.[1]).toMatchObject({
            supplyStatus: "stale",
            supply: "1.5",
            supplyObservedAt: 1_700_000_000_000,
        });
        for (const unknown of variants?.slice(2) ?? []) {
            expect(unknown).not.toHaveProperty("supply");
            expect(unknown).not.toHaveProperty("supplyObservedAt");
        }
        expect(variants?.slice(2).map((chain) => chain.supplyStatus)).toEqual([
            "missing",
            "unspecified",
        ]);
    });
});
