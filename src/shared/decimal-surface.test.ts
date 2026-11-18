import { describe, expect, it, vi } from "vitest";
import { CatalogLookupError, CatalogNotReadyError, type ClientCatalog } from "../catalogs/types.js";
import {
    CATALOG_MISS_REFRESH_TIMEOUT_MS,
    createCatalogSdkScales,
    createReadyGate,
    withCatalogRefresh,
} from "./decimal-surface.js";

describe("createReadyGate", () => {
    it("reports overflow as terminal instead of leaving a silently failed gate", async () => {
        let resolveReady: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        const onTerminalError = vi.fn();
        const deliver = vi.fn();
        const gate = createReadyGate(() => ready, { onTerminalError });

        for (let index = 0; index < 1_025; index++) gate.run(deliver);

        expect(onTerminalError).toHaveBeenCalledOnce();
        expect(onTerminalError.mock.calls[0]?.[0]).toBeInstanceOf(CatalogNotReadyError);

        resolveReady?.();
        await ready;
        await Promise.resolve();

        expect(deliver).not.toHaveBeenCalled();
        gate.run(deliver);
        expect(deliver).not.toHaveBeenCalled();
    });

    it("clears queued deliveries when its owning subscription closes", async () => {
        let resolveReady: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        const deliver = vi.fn();
        const gate = createReadyGate(() => ready, { onTerminalError: vi.fn() });

        gate.run(deliver);
        gate.close();
        resolveReady?.();
        await ready;
        await Promise.resolve();

        expect(deliver).not.toHaveBeenCalled();
    });
});

describe("withCatalogRefresh", () => {
    it("fails with the current catalog when the miss refresh stalls", async () => {
        vi.useFakeTimers();
        try {
            const catalog = { refresh: () => new Promise(() => {}) } as unknown as ClientCatalog;
            const scales = createCatalogSdkScales(() => catalog);
            const read = withCatalogRefresh(scales, () => {
                throw new CatalogLookupError("market", "symbolId", 999);
            });
            const settled = expect(read).rejects.toBeInstanceOf(CatalogLookupError);

            await vi.advanceTimersByTimeAsync(CATALOG_MISS_REFRESH_TIMEOUT_MS);
            await settled;
        } finally {
            vi.useRealTimers();
        }
    });
});
