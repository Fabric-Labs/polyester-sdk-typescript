import { describe, expect, it, vi } from "vitest";
import { CatalogNotReadyError } from "../catalogs/types.js";
import { createReadyGate } from "./decimal-surface.js";

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
