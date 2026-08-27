import { describe, expect, it, vi } from "vitest";
import { CatalogNotReadyError } from "../catalogs/types.js";
import { createReadyGate } from "./decimal-surface.js";

describe("createReadyGate", () => {
    it("fails closed instead of retaining an unbounded pending event queue", async () => {
        let resolveReady: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve;
        });
        const onError = vi.fn();
        const deliver = vi.fn();
        const gate = createReadyGate(() => ready, onError);

        for (let index = 0; index < 1_025; index++) gate.run(deliver);

        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(CatalogNotReadyError);

        resolveReady?.();
        await ready;
        await Promise.resolve();

        expect(deliver).not.toHaveBeenCalled();
        gate.run(deliver);
        expect(deliver).not.toHaveBeenCalled();
    });
});
