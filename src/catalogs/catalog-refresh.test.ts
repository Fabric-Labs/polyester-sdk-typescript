import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotConfig } from "../services/market-data/index.js";
import type { DepositWithdrawConfig } from "../services/zipper/index.js";
import { refreshCatalogs, refreshCatalogsInBackground } from "./catalog-refresh.js";
import {
    getAsset,
    getPair,
    setAssetCatalog,
    setEnrichedPairCatalog,
} from "./market-data-catalog.js";
import { ASSET_CATALOG, PAIR_CATALOG } from "./market-data-catalog.generated.js";
import {
    getAllZipperContracts,
    getZipperAsset,
    getZipperChain,
    setZipperAssetsCatalog,
    setZipperChainsCatalog,
    setZipperContractsCatalog,
} from "./zipper-catalog.js";
import {
    ZIPPER_ASSET_CATALOG,
    ZIPPER_CHAIN_CATALOG,
    ZIPPER_CONTRACTS_CATALOG,
} from "./zipper-catalog.generated.js";

function resetGeneratedCatalogs(): void {
    setAssetCatalog(ASSET_CATALOG);
    setEnrichedPairCatalog(PAIR_CATALOG);
    setZipperChainsCatalog(ZIPPER_CHAIN_CATALOG);
    setZipperAssetsCatalog(ZIPPER_ASSET_CATALOG);
    setZipperContractsCatalog(ZIPPER_CONTRACTS_CATALOG);
}

function spotConfig(): SpotConfig {
    return {
        assets: [
            {
                symbol: "REFRESH_BASE",
                ledgerId: 900_001,
                name: "Refresh Base",
                quantityDisplayDecimals: 2,
                quantityScale: 8,
            },
            {
                symbol: "REFRESH_QUOTE",
                ledgerId: 900_002,
                name: "Refresh Quote",
                quantityDisplayDecimals: 2,
                quantityScale: 6,
            },
        ],
        pairs: [
            {
                symbolId: 900_001,
                symbol: "REFRESH_BASE-REFRESH_QUOTE",
                baseAsset: "REFRESH_BASE",
                quoteAsset: "REFRESH_QUOTE",
                tickSize: "0.01",
                stepSize: "0.1",
                minNotionalQuote: "1",
                minQtyBase: "0.1",
                allowBuyFeeFromReceived: true,
                defaultMarketSlippagePctBuy: 0.5,
                defaultMarketSlippagePctSell: 1,
                maxClientRefDriftPct: 2,
                marketdata: { orderbookPriceBuckets: [0.01, 0.1] },
                baseQuantityScale: 8,
                quoteQuantityScale: 6,
                listingAt: null,
                delistingAt: null,
                status: "enabled",
            },
        ],
        tsSec: 1,
    };
}

function zipperConfig(): DepositWithdrawConfig {
    return {
        chains: [
            {
                chainId: 900_001,
                code: "refresh-chain",
                name: "Refresh Chain",
                nativeChainId: "900001",
                nativeCurrencySymbol: "REF",
                explorerUrl: "https://explorer.example",
                icon: "refresh-chain.svg",
                requiredConfirmations: 1,
                confirmationTimeSeconds: 1,
                isCaseSensitive: false,
                minAddressLength: 1,
                maxAddressLength: 128,
            },
        ],
        assets: [
            {
                asset: "REFRESH_ASSET",
                ledgerId: 900_003,
                name: "Refresh Asset",
                icon: "refresh-asset.svg",
                quantityScale: 8,
                quantityDisplayDecimals: 2,
                uAssetId: "refresh-asset",
                variants: [
                    {
                        chainAssetId: 900_004,
                        chainId: 900_001,
                        isNativeAsset: false,
                        networkFee: "0",
                        networkFeeTsSec: 1,
                        depositMinAmount: "1",
                        withdrawMinAmount: "1",
                        sourceToken: {
                            address: "0x0000000000000000000000000000000000000001",
                            decimals: 8,
                        },
                        zToken: {
                            address: "0x0000000000000000000000000000000000000002",
                            decimals: 8,
                        },
                    },
                ],
            },
        ],
        polyesterChainId: 900_001,
        contracts: [
            {
                name: "refreshContract",
                address: "0x0000000000000000000000000000000000000003",
                type: "refresh",
                description: "refresh contract",
                version: 1,
            },
        ],
        tsMs: 1_000,
    };
}

function refreshClient(
    overrides: {
        getSpotConfig?: () => Promise<SpotConfig>;
        getDepositWithdrawConfig?: () => Promise<DepositWithdrawConfig>;
    } = {},
) {
    return {
        marketData: {
            getSpotConfig: vi.fn(overrides.getSpotConfig ?? (() => Promise.resolve(spotConfig()))),
        },
        zipper: {
            getDepositWithdrawConfig: vi.fn(
                overrides.getDepositWithdrawConfig ?? (() => Promise.resolve(zipperConfig())),
            ),
        },
    };
}

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("catalog refresh", () => {
    beforeEach(() => {
        resetGeneratedCatalogs();
    });

    it("hydrates market and zipper catalogs from explicit refresh", async () => {
        const client = refreshClient();

        await refreshCatalogs(client);

        expect(client.marketData.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(client.zipper.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
        expect(getAsset("REFRESH_BASE")?.ledgerId).toBe(900_001);
        expect(getPair("REFRESH_BASE-REFRESH_QUOTE").symbolId).toBe(900_001);
        expect(getZipperChain("refresh-chain")?.chainId).toBe(900_001);
        expect(getZipperAsset("REFRESH_ASSET")?.ledgerId).toBe(900_003);
        expect(getAllZipperContracts()).toEqual([
            expect.objectContaining({ name: "refreshContract" }),
        ]);
    });

    it("dedupes concurrent refresh calls", async () => {
        const spot = deferred<SpotConfig>();
        const zipper = deferred<DepositWithdrawConfig>();
        const client = refreshClient({
            getSpotConfig: () => spot.promise,
            getDepositWithdrawConfig: () => zipper.promise,
        });

        const firstRefresh = refreshCatalogs(client);
        const secondRefresh = refreshCatalogs(client);

        expect(client.marketData.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(client.zipper.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);

        spot.resolve(spotConfig());
        zipper.resolve(zipperConfig());
        await Promise.all([firstRefresh, secondRefresh]);
    });

    it("rejects explicit refresh failures", async () => {
        const client = refreshClient({
            getSpotConfig: () => Promise.reject(new Error("market refresh failed")),
        });

        await expect(refreshCatalogs(client)).rejects.toThrow("market refresh failed");
    });

    it("swallows background refresh failures", async () => {
        const client = refreshClient({
            getSpotConfig: () => Promise.reject(new Error("market refresh failed")),
            getDepositWithdrawConfig: () => Promise.reject(new Error("zipper refresh failed")),
        });

        refreshCatalogsInBackground(client);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(client.marketData.getSpotConfig).toHaveBeenCalledTimes(1);
        expect(client.zipper.getDepositWithdrawConfig).toHaveBeenCalledTimes(1);
    });
});
