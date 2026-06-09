import { describe, expect, it, vi } from "vitest";
import type {
    AssetConfig,
    DepositWithdrawConfig,
    PairConfig,
    SpotConfig,
} from "../shared/catalog-config.js";
import { createPolyesterCatalog } from "./client-catalog.js";
import { createReader } from "./readers.js";
import { buildCatalogSnapshot } from "./snapshot.js";
import {
    CatalogLookupError,
    CatalogNotReadyError,
    type CatalogRefreshSource,
    type CatalogSnapshot,
} from "./types.js";

type MutableCatalogSnapshot = Omit<CatalogSnapshot, "market" | "version"> & {
    market: CatalogSnapshot["market"];
    version: number;
};

const marketRefreshConfig = {
    assets: [],
    pairs: [],
    tsSec: 0,
} satisfies Awaited<ReturnType<CatalogRefreshSource["market"]>>;

const zipperRefreshConfig = {
    chains: [],
    assets: [],
    polyesterChainId: 0,
    contracts: [],
    tsMs: 0,
} satisfies Awaited<ReturnType<CatalogRefreshSource["zipper"]>>;

function asset(
    symbol: string,
    ledgerId: number,
    quantityScale: number,
    quantityDisplayDecimals = quantityScale,
): AssetConfig {
    return {
        symbol,
        ledgerId,
        name: symbol,
        quantityDisplayDecimals,
        quantityScale,
    };
}

function pair(params: {
    symbol: string;
    symbolId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
    stepSize?: string;
    minQtyBase?: string;
}): PairConfig {
    return {
        symbolId: params.symbolId,
        symbol: params.symbol,
        baseAsset: params.baseAsset.symbol,
        quoteAsset: params.quoteAsset.symbol,
        tickSize: "0.01",
        stepSize: params.stepSize ?? "0.01",
        minNotionalQuote: "1",
        minQtyBase: params.minQtyBase ?? "0.01",
        allowBuyFeeFromReceived: false,
        defaultMarketSlippagePctBuy: 0,
        defaultMarketSlippagePctSell: 0,
        maxClientRefDriftPct: 0,
        baseQuantityScale: params.baseAsset.quantityScale,
        quoteQuantityScale: params.quoteAsset.quantityScale,
        listingAt: null,
        delistingAt: null,
        status: "enabled",
    };
}

function marketSeed(params: {
    symbol: string;
    symbolId: number;
    baseAsset: AssetConfig;
    quoteAsset: AssetConfig;
}): SpotConfig {
    return {
        assets: [params.baseAsset, params.quoteAsset],
        pairs: [
            pair({
                symbol: params.symbol,
                symbolId: params.symbolId,
                baseAsset: params.baseAsset,
                quoteAsset: params.quoteAsset,
            }),
        ],
        tsSec: 0,
    };
}

function emptyZipperSeed(): DepositWithdrawConfig {
    return zipperRefreshConfig;
}

function snapshotSeed(market: SpotConfig): CatalogSnapshot {
    return buildCatalogSnapshot({
        market,
        zipper: emptyZipperSeed(),
    });
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

function refreshSource(overrides: Partial<CatalogRefreshSource> = {}): CatalogRefreshSource {
    return {
        market: vi.fn(() => Promise.resolve(marketRefreshConfig)),
        zipper: vi.fn(() => Promise.resolve(zipperRefreshConfig)),
        ...overrides,
    };
}

describe("createPolyesterCatalog", () => {
    it("keeps custom catalog snapshots isolated per client", () => {
        const quote = asset("USD", 200, 2);
        const coarseAsset = asset("TEST", 101, 2);
        const preciseAsset = asset("TEST", 102, 4);
        const coarseCatalog = createPolyesterCatalog({
            snapshot: snapshotSeed(
                marketSeed({
                    symbol: "TEST-USD",
                    symbolId: 11,
                    baseAsset: coarseAsset,
                    quoteAsset: quote,
                }),
            ),
            refresh: false,
        });
        const preciseCatalog = createPolyesterCatalog({
            snapshot: snapshotSeed(
                marketSeed({
                    symbol: "TEST-USD",
                    symbolId: 22,
                    baseAsset: preciseAsset,
                    quoteAsset: quote,
                }),
            ),
            refresh: false,
        });

        expect(coarseCatalog.snapshot()).not.toBe(preciseCatalog.snapshot());
        expect(coarseCatalog.market.requireSymbolIdByPairSymbol("TEST-USD")).toBe(11);
        expect(preciseCatalog.market.requireSymbolIdByPairSymbol("TEST-USD")).toBe(22);
        expect(coarseCatalog.orders.parseQuantity("1.23", "TEST-USD")).toMatchObject({
            value: "123",
            scale: 2,
            formatted: "1.23",
        });
        expect(preciseCatalog.orders.parseQuantity("1.23", "TEST-USD")).toMatchObject({
            value: "12300",
            scale: 4,
            formatted: "1.23",
        });
    });

    it("starts empty until a snapshot is passed or refresh succeeds", async () => {
        const catalog = createPolyesterCatalog({ refresh: false });

        expect(catalog.state()).toEqual({ status: "empty" });
        expect(await catalog.ready()).toBeNull();
        expect(() => catalog.snapshot()).toThrow(CatalogNotReadyError);
        expect(() => catalog.market.requireAssetBySymbol("NOPE")).toThrow(CatalogNotReadyError);
    });

    it("refreshes an empty catalog explicitly", async () => {
        const quote = asset("USD", 200, 2);
        const clientOnlyAsset = asset("CLIENT_ONLY_TEST_ASSET", 201, 3);
        const catalog = createPolyesterCatalog({
            refresh: refreshSource({
                market: vi.fn(() =>
                    Promise.resolve(
                        marketSeed({
                            symbol: "CLIENT_ONLY_TEST_ASSET-USD",
                            symbolId: 201,
                            baseAsset: clientOnlyAsset,
                            quoteAsset: quote,
                        }),
                    ),
                ),
            }),
        });

        await catalog.refresh();

        expect(catalog.market.requireAssetBySymbol("CLIENT_ONLY_TEST_ASSET")).toBe(clientOnlyAsset);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });

    it("rebuilds lookup indexes when a reused snapshot object advances version", () => {
        const quote = asset("USD", 300, 2);
        const initialAsset = asset("CACHE_INITIAL", 301, 2);
        const updatedAsset = asset("CACHE_UPDATED", 302, 2);
        const initialSnapshot = createPolyesterCatalog({
            snapshot: snapshotSeed(
                marketSeed({
                    symbol: "CACHE_INITIAL-USD",
                    symbolId: 301,
                    baseAsset: initialAsset,
                    quoteAsset: quote,
                }),
            ),
            refresh: false,
        }).snapshot();
        const updatedSnapshot = createPolyesterCatalog({
            snapshot: snapshotSeed(
                marketSeed({
                    symbol: "CACHE_UPDATED-USD",
                    symbolId: 302,
                    baseAsset: updatedAsset,
                    quoteAsset: quote,
                }),
            ),
            refresh: false,
        }).snapshot();
        const currentSnapshot: MutableCatalogSnapshot = {
            ...initialSnapshot,
        };
        const reader = createReader(() => currentSnapshot);

        expect(reader.market.getAssetBySymbol("CACHE_INITIAL")).toBe(initialAsset);

        currentSnapshot.market = updatedSnapshot.market;
        currentSnapshot.version += 1;

        expect(reader.market.getAssetBySymbol("CACHE_INITIAL")).toBeNull();
        expect(reader.market.getAssetBySymbol("CACHE_UPDATED")).toBe(updatedAsset);
    });

    it("fails closed when a custom snapshot does not contain a requested catalog entry", () => {
        const catalog = createPolyesterCatalog({
            snapshot: buildCatalogSnapshot({
                market: {
                    assets: [],
                    pairs: [],
                    tsSec: 0,
                },
                zipper: emptyZipperSeed(),
            }),
            refresh: false,
        });

        try {
            catalog.market.requirePairBySymbolId(1);
            expect.fail("expected catalog lookup to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(CatalogLookupError);
            expect(error).toMatchObject({
                code: "CATALOG_LOOKUP_MISS",
                domain: "market",
                lookup: "symbolId",
                value: 1,
            });
        }

        try {
            catalog.orders.formatQuantity(1n, 1);
            expect.fail("expected order catalog lookup to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(CatalogLookupError);
            expect(error).toMatchObject({
                code: "CATALOG_LOOKUP_MISS",
                domain: "market",
                lookup: "symbolId",
                value: 1,
            });
        }
    });

    it("shares one in-flight refresh across concurrent refresh calls", async () => {
        const market = deferred<typeof marketRefreshConfig>();
        const zipper = deferred<typeof zipperRefreshConfig>();
        const source = refreshSource({
            market: vi.fn(() => market.promise),
            zipper: vi.fn(() => zipper.promise),
        });
        const catalog = createPolyesterCatalog({ refresh: source });

        const firstRefresh = catalog.refresh();
        const secondRefresh = catalog.refresh();

        expect(secondRefresh).toBe(firstRefresh);
        expect(source.market).toHaveBeenCalledTimes(1);
        expect(source.zipper).toHaveBeenCalledTimes(1);

        market.resolve(marketRefreshConfig);
        zipper.resolve(zipperRefreshConfig);

        const refreshed = await firstRefresh;
        expect(refreshed.source).toBe("api");
        expect(refreshed.version).toBe(1);
    });

    it("resolves ready to the refreshed API snapshot after a successful refresh", async () => {
        const catalog = createPolyesterCatalog({ refresh: refreshSource() });

        const refreshed = await catalog.refresh();

        expect(refreshed.source).toBe("api");
        expect(await catalog.ready()).toBe(refreshed);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });

    it("marks state stale and resolves ready to the existing snapshot after refresh failure", async () => {
        const error = new Error("catalog refresh failed");
        const catalog = createPolyesterCatalog({
            snapshot: buildCatalogSnapshot({
                market: marketRefreshConfig,
                zipper: zipperRefreshConfig,
            }),
            refresh: refreshSource({
                market: vi.fn(() => Promise.reject(error)),
            }),
        });
        const initial = catalog.snapshot();

        await expect(catalog.refresh()).rejects.toThrow(error);

        expect(catalog.snapshot()).toBe(initial);
        expect(await catalog.ready()).toBe(initial);
        expect(catalog.state()).toEqual({ status: "stale", source: "snapshot", error });
    });

    it("resolves ready to a later successful refresh after an earlier failure", async () => {
        const error = new Error("catalog refresh failed");
        const source = refreshSource({
            market: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(marketRefreshConfig),
        });
        const catalog = createPolyesterCatalog({ refresh: source });

        await expect(catalog.refresh()).rejects.toThrow(error);
        expect(await catalog.ready()).toBeNull();

        const refreshed = await catalog.refresh();

        expect(refreshed.source).toBe("api");
        expect(refreshed.version).toBe(1);
        expect(await catalog.ready()).toBe(refreshed);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });
});
