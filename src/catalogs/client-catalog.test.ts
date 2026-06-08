import { describe, expect, it, vi } from "vitest";
import { createPolyesterCatalog } from "./client-catalog.js";
import type { CatalogRefreshSource } from "./types.js";

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
        expect(refreshed.version).toBe(2);
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
            refresh: refreshSource({
                market: vi.fn(() => Promise.reject(error)),
            }),
        });
        const initial = catalog.snapshot();

        await expect(catalog.refresh()).rejects.toThrow(error);

        expect(await catalog.ready()).toBe(initial);
        expect(catalog.state()).toEqual({ status: "stale", source: "generated", error });
    });

    it("resolves ready to a later successful refresh after an earlier failure", async () => {
        const error = new Error("catalog refresh failed");
        const source = refreshSource({
            market: vi.fn().mockRejectedValueOnce(error).mockResolvedValue(marketRefreshConfig),
        });
        const catalog = createPolyesterCatalog({ refresh: source });
        const initial = catalog.snapshot();

        await expect(catalog.refresh()).rejects.toThrow(error);
        expect(await catalog.ready()).toBe(initial);

        const refreshed = await catalog.refresh();

        expect(refreshed.source).toBe("api");
        expect(refreshed.version).toBe(2);
        expect(await catalog.ready()).toBe(refreshed);
        expect(catalog.state()).toEqual({ status: "fresh", source: "api" });
    });
});
