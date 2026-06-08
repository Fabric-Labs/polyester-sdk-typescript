import { describe, expect, it, vi } from "vitest";
import { refreshCatalogs, refreshCatalogsInBackground } from "./catalog-refresh.js";

function refreshClient(refresh = vi.fn(() => Promise.resolve())) {
    return {
        catalog: {
            refresh,
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
    it("delegates explicit refreshes to the client-owned catalog", async () => {
        const client = refreshClient();

        await refreshCatalogs(client);

        expect(client.catalog.refresh).toHaveBeenCalledTimes(1);
    });

    it("leaves refresh concurrency to the client catalog", async () => {
        const refresh = deferred<void>();
        const client = refreshClient(vi.fn(() => refresh.promise));

        const firstRefresh = refreshCatalogs(client);
        const secondRefresh = refreshCatalogs(client);

        expect(client.catalog.refresh).toHaveBeenCalledTimes(2);

        refresh.resolve();
        await Promise.all([firstRefresh, secondRefresh]);
    });

    it("rejects explicit refresh failures", async () => {
        const client = refreshClient(
            vi.fn(() => Promise.reject(new Error("catalog refresh failed"))),
        );

        await expect(refreshCatalogs(client)).rejects.toThrow("catalog refresh failed");
    });

    it("swallows background refresh failures", async () => {
        const client = refreshClient(
            vi.fn(() => Promise.reject(new Error("catalog refresh failed"))),
        );

        refreshCatalogsInBackground(client);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(client.catalog.refresh).toHaveBeenCalledTimes(1);
    });
});
