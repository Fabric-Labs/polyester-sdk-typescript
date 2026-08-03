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
        allowBuyFeeFromBase: false,
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
        expect(coarseCatalog.market.decimalQuantityToScaled("1.23", "TEST-USD")).toEqual({
            scaledValue: "123",
            decimal: "1.23",
            display: "1.23",
            scale: 2,
        });
        expect(preciseCatalog.market.decimalQuantityToScaled("1.23", "TEST-USD")).toEqual({
            scaledValue: "12300",
            decimal: "1.23",
            display: "1.23",
            scale: 4,
        });
    });

    it("starts empty until a snapshot is passed or refresh succeeds", async () => {
        const catalog = createPolyesterCatalog({ refresh: false });

        expect(catalog.state()).toEqual({ status: "empty" });
        expect(await catalog.ready()).toBeNull();
        expect(() => catalog.snapshot()).toThrow(CatalogNotReadyError);
        expect(() => catalog.market.requireAssetBySymbol("NOPE")).toThrow(CatalogNotReadyError);
    });

    it("seeds an empty catalog synchronously for ready and lookup", async () => {
        const quote = asset("USD", 400, 2);
        const seededAsset = asset("SEEDED", 401, 3);
        const seeded = snapshotSeed(
            marketSeed({
                symbol: "SEEDED-USD",
                symbolId: 401,
                baseAsset: seededAsset,
                quoteAsset: quote,
            }),
        );
        const catalog = createPolyesterCatalog({ refresh: false });

        catalog.setSnapshot(seeded);

        expect(catalog.snapshot()).toBe(seeded);
        expect(catalog.state()).toEqual({ status: "fresh", source: "snapshot" });
        expect(await catalog.ready()).toBe(seeded);
        expect(catalog.market.requireAssetBySymbol("SEEDED")).toBe(seededAsset);
        expect(catalog.market.requireSymbolIdByPairSymbol("SEEDED-USD")).toBe(401);
        expect(catalog.market.decimalQuantityToScaled("1.234", "SEEDED-USD")).toEqual({
            scaledValue: "1234",
            decimal: "1.234",
            display: "1.234",
            scale: 3,
        });
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

    it("refreshes normally after a snapshot is seeded", async () => {
        const seedQuote = asset("USD", 410, 2);
        const seededAsset = asset("SEEDED_REFRESH", 411, 2);
        const apiQuote = asset("USD", 420, 2);
        const apiAsset = asset("API_REFRESHED", 421, 2);
        const market = deferred<SpotConfig>();
        const zipper = deferred<DepositWithdrawConfig>();
        const source = refreshSource({
            market: vi.fn(() => market.promise),
            zipper: vi.fn(() => zipper.promise),
        });
        const catalog = createPolyesterCatalog({ refresh: source });
        const seeded = snapshotSeed(
            marketSeed({
                symbol: "SEEDED_REFRESH-USD",
                symbolId: 411,
                baseAsset: seededAsset,
                quoteAsset: seedQuote,
            }),
        );

        catalog.setSnapshot(seeded);
        const refresh = catalog.refresh();

        expect(catalog.state()).toEqual({
            status: "refreshing",
            previousSource: "snapshot",
        });

        market.resolve(
            marketSeed({
                symbol: "API_REFRESHED-USD",
                symbolId: 421,
                baseAsset: apiAsset,
                quoteAsset: apiQuote,
            }),
        );
        zipper.resolve(emptyZipperSeed());

        const refreshed = await refresh;

        expect(refreshed.source).toBe("api");
        expect(refreshed.version).toBe(seeded.version + 1);
        expect(catalog.snapshot()).toBe(refreshed);
        expect(await catalog.ready()).toBe(refreshed);
        expect(catalog.market.getAssetBySymbol("SEEDED_REFRESH")).toBeNull();
        expect(catalog.market.requireAssetBySymbol("API_REFRESHED")).toBe(apiAsset);
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
            catalog.market.quantityScaledToDecimalString(1n, 1);
            expect.fail("expected conversion pair lookup to fail");
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
            catalog.orders.getSpotOrderConstraints("MISSING-USD");
            expect.fail("expected order constraints lookup to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(CatalogLookupError);
            expect(error).toMatchObject({
                code: "CATALOG_LOOKUP_MISS",
                domain: "market",
                lookup: "symbol",
                value: "MISSING-USD",
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

    it("does not cancel an in-flight refresh when a snapshot is seeded", async () => {
        const seedQuote = asset("USD", 430, 2);
        const seededAsset = asset("SEEDED_IN_FLIGHT", 431, 2);
        const apiQuote = asset("USD", 440, 2);
        const apiAsset = asset("API_IN_FLIGHT", 441, 2);
        const market = deferred<SpotConfig>();
        const zipper = deferred<DepositWithdrawConfig>();
        const source = refreshSource({
            market: vi.fn(() => market.promise),
            zipper: vi.fn(() => zipper.promise),
        });
        const catalog = createPolyesterCatalog({ refresh: source });

        const refresh = catalog.refresh();
        const seeded = snapshotSeed(
            marketSeed({
                symbol: "SEEDED_IN_FLIGHT-USD",
                symbolId: 431,
                baseAsset: seededAsset,
                quoteAsset: seedQuote,
            }),
        );

        catalog.setSnapshot(seeded);

        expect(source.market).toHaveBeenCalledTimes(1);
        expect(source.zipper).toHaveBeenCalledTimes(1);
        expect(catalog.state()).toEqual({ status: "fresh", source: "snapshot" });
        expect(await catalog.ready()).toBe(seeded);
        expect(catalog.market.requireAssetBySymbol("SEEDED_IN_FLIGHT")).toBe(seededAsset);

        market.resolve(
            marketSeed({
                symbol: "API_IN_FLIGHT-USD",
                symbolId: 441,
                baseAsset: apiAsset,
                quoteAsset: apiQuote,
            }),
        );
        zipper.resolve(emptyZipperSeed());

        const refreshed = await refresh;

        expect(refreshed.source).toBe("api");
        expect(refreshed.version).toBe(seeded.version + 1);
        expect(catalog.snapshot()).toBe(refreshed);
        expect(await catalog.ready()).toBe(refreshed);
        expect(catalog.market.getAssetBySymbol("SEEDED_IN_FLIGHT")).toBeNull();
        expect(catalog.market.requireAssetBySymbol("API_IN_FLIGHT")).toBe(apiAsset);
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

    it("ensureReady starts a refresh when the catalog is empty", async () => {
        const source = refreshSource();
        const catalog = createPolyesterCatalog({ refresh: source });

        const snapshot = await catalog.ensureReady();

        expect(snapshot.source).toBe("api");
        expect(source.market).toHaveBeenCalledTimes(1);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });

    it("ensureReady resolves the existing snapshot without refreshing", async () => {
        const source = refreshSource();
        const seeded = snapshotSeed(marketRefreshConfig);
        const catalog = createPolyesterCatalog({ snapshot: seeded, refresh: source });

        expect(await catalog.ensureReady()).toBe(seeded);
        expect(source.market).not.toHaveBeenCalled();
    });

    it("ensureReady joins an in-flight refresh instead of starting another", async () => {
        const market = deferred<SpotConfig>();
        const source = refreshSource({ market: vi.fn(() => market.promise) });
        const catalog = createPolyesterCatalog({ refresh: source });

        const refresh = catalog.refresh();
        const ensured = catalog.ensureReady();

        expect(source.market).toHaveBeenCalledTimes(1);

        market.resolve(marketRefreshConfig);

        expect(await ensured).toBe(await refresh);
    });

    it("ensureReady rejects when empty and no refresh source is configured", async () => {
        const catalog = createPolyesterCatalog({ refresh: false });

        await expect(catalog.ensureReady()).rejects.toBeInstanceOf(CatalogNotReadyError);
    });

    it("ready stays passive and never starts a refresh", async () => {
        const source = refreshSource();
        const catalog = createPolyesterCatalog({ refresh: source });

        expect(await catalog.ready()).toBeNull();
        expect(source.market).not.toHaveBeenCalled();
    });

    it("stamps snapshots with a millisecond tsMs timestamp", () => {
        const before = Date.now();
        const snapshot = snapshotSeed(marketRefreshConfig);
        expect(snapshot.tsMs).toBeGreaterThanOrEqual(before);
        expect(snapshot.tsMs).toBeLessThanOrEqual(Date.now());
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

describe("snapshot cell", () => {
    function memoryCell(seed?: CatalogSnapshot) {
        let current: CatalogSnapshot | undefined = seed;
        return {
            get: vi.fn(() => current),
            set: vi.fn((snapshot: CatalogSnapshot) => {
                current = snapshot;
            }),
        };
    }

    it("reads and writes the snapshot through the cell", () => {
        const cell = memoryCell();
        const catalog = createPolyesterCatalog({ cell });
        const base = asset("CELL", 1, 2);
        const quote = asset("USD", 2, 2);
        const seeded = snapshotSeed(
            marketSeed({ symbol: "CELL-USD", symbolId: 1, baseAsset: base, quoteAsset: quote }),
        );

        catalog.setSnapshot(seeded);

        expect(cell.set).toHaveBeenCalledWith(seeded);
        expect(catalog.snapshot()).toBe(seeded);
        expect(catalog.market.requireAssetBySymbol("CELL")).toBe(base);
    });

    it("sees external cell writes without setSnapshot", () => {
        const cell = memoryCell();
        const catalog = createPolyesterCatalog({ cell });

        expect(() => catalog.snapshot()).toThrow(CatalogNotReadyError);

        const base = asset("EXT", 3, 2);
        const quote = asset("USD", 4, 2);
        cell.set(
            snapshotSeed(
                marketSeed({ symbol: "EXT-USD", symbolId: 2, baseAsset: base, quoteAsset: quote }),
            ),
        );

        expect(catalog.market.requireAssetBySymbol("EXT")).toBe(base);
    });

    it("seeds an empty cell from the snapshot option", () => {
        const cell = memoryCell();
        const seeded = snapshotSeed(marketRefreshConfig);
        const catalog = createPolyesterCatalog({ cell, snapshot: seeded });

        expect(cell.get()).toBe(seeded);
        expect(catalog.state()).toEqual({ status: "fresh", source: "snapshot" });
    });

    it("never clobbers a pre-populated cell with the snapshot option", () => {
        const preloaded = snapshotSeed(marketRefreshConfig);
        const cell = memoryCell(preloaded);
        const catalog = createPolyesterCatalog({
            cell,
            snapshot: snapshotSeed(marketRefreshConfig),
        });

        expect(catalog.snapshot()).toBe(preloaded);
        expect(cell.set).not.toHaveBeenCalled();
    });

    it("writes refreshed snapshots into the cell", async () => {
        const cell = memoryCell();
        const catalog = createPolyesterCatalog({ cell, refresh: refreshSource() });

        const refreshed = await catalog.refresh();

        expect(cell.get()).toBe(refreshed);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });
});
