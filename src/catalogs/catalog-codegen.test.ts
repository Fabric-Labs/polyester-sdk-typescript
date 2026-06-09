import { describe, expect, it } from "vitest";
import {
    renderMarketDataCatalogModule,
    renderZipperCatalogModule,
    validateCatalogSnapshot,
    validateMarketCatalogData,
} from "./catalog-codegen.js";
import { buildGeneratedCatalogSnapshot } from "./snapshot.js";
import type { DepositWithdrawConfig, SpotConfig } from "./config-types.js";
import { buildMarketCatalogData } from "./market-data-catalog.js";

const spotConfig = {
    assets: [
        {
            symbol: "BTC",
            ledgerId: 1,
            name: "Bitcoin",
            quantityDisplayDecimals: 8,
            quantityScale: 8,
        },
        {
            symbol: "USDT",
            ledgerId: 2,
            name: "Tether",
            quantityDisplayDecimals: 6,
            quantityScale: 6,
        },
    ],
    pairs: [
        {
            symbolId: 10,
            symbol: "BTC-USDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            tickSize: "0.01",
            stepSize: "0.0001",
            minNotionalQuote: "10",
            minQtyBase: "0.0001",
            allowBuyFeeFromReceived: false,
            defaultMarketSlippagePctBuy: 1,
            defaultMarketSlippagePctSell: 1,
            maxClientRefDriftPct: 5,
            baseQuantityScale: 8,
            quoteQuantityScale: 6,
            listingAt: null,
            delistingAt: null,
            status: "enabled",
        },
    ],
    tsSec: 1,
} satisfies SpotConfig;

const zipperConfig = {
    chains: [
        {
            chainId: 100,
            code: "base-sepolia",
            name: "Base Sepolia",
            nativeChainId: "84532",
            nativeCurrencySymbol: "ETH",
            explorerUrl: "https://sepolia.basescan.org",
            icon: "base.webp",
            requiredConfirmations: 1,
            confirmationTimeSeconds: 60,
            isCaseSensitive: false,
            minAddressLength: 42,
            maxAddressLength: 42,
        },
    ],
    assets: [
        {
            asset: "USDT",
            ledgerId: 2,
            name: "Tether",
            icon: "usdt.webp",
            quantityScale: 6,
            quantityDisplayDecimals: 6,
            variants: [
                {
                    chainAssetId: 200,
                    chainId: 100,
                    isNativeAsset: false,
                    networkFee: "1",
                    networkFeeTsSec: 1,
                    depositMinAmount: "10",
                    withdrawMinAmount: "10",
                    sourceToken: {
                        address: "0x0000000000000000000000000000000000000001",
                        decimals: 6,
                    },
                    zToken: {
                        address: "0x0000000000000000000000000000000000000002",
                        decimals: 6,
                    },
                },
            ],
            uAssetId: "u-usdt",
        },
    ],
    polyesterChainId: 999,
    contracts: [
        {
            name: "zipperToken",
            address: "0x0000000000000000000000000000000000000003",
            type: "token",
            description: "Zipper token",
            version: 1,
        },
    ],
    tsMs: 1,
} satisfies DepositWithdrawConfig;

describe("catalog codegen", () => {
    it("renders market catalog modules from pinned fixtures", () => {
        const rendered = renderMarketDataCatalogModule(spotConfig);

        expect(rendered).toContain("Run `bun run refresh:catalogs:testnet` to regenerate");
        expect(rendered).toContain("export const ASSET_CATALOG: AssetConfig[]");
        expect(rendered).toContain('"symbol": "BTC-USDT"');
        expect(rendered).toContain('"baseAsset": {');
    });

    it("renders zipper catalog modules with enriched chains and contract names", () => {
        const rendered = renderZipperCatalogModule(zipperConfig);

        expect(rendered).toContain("export const ZIPPER_ASSET_CATALOG");
        expect(rendered).toContain('"code": "base-sepolia"');
        expect(rendered).toContain('"chainAssetId": 200');
        expect(rendered).toContain('"zipperToken"');
        expect(rendered).not.toContain('"variants"');
    });

    it("rejects duplicate market catalog keys", () => {
        const btc = spotConfig.assets[0];
        const usdt = spotConfig.assets[1];
        if (!btc || !usdt) throw new Error("Expected spot fixture assets");
        const data = buildMarketCatalogData({
            ...spotConfig,
            assets: [btc, usdt, btc],
        });

        expect(() => validateMarketCatalogData(data)).toThrow(
            "[catalog] duplicate market asset symbol: BTC",
        );
    });

    it("rejects zipper assets with unknown chains before rendering", () => {
        const usdt = zipperConfig.assets[0];
        const variant = usdt?.variants[0];
        if (!usdt || !variant) throw new Error("Expected zipper fixture asset variant");

        expect(() =>
            renderZipperCatalogModule({
                ...zipperConfig,
                assets: [
                    {
                        ...usdt,
                        variants: [
                            {
                                ...variant,
                                chainId: 404,
                            },
                        ],
                    },
                ],
            }),
        ).toThrow("[catalog] zipper asset USDT references unknown chainId: 404");
    });

    it("validates the checked-in generated catalog snapshot", () => {
        expect(() => validateCatalogSnapshot(buildGeneratedCatalogSnapshot())).not.toThrow();
    });
});
