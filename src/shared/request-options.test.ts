import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, ValidationError } from "./errors.js";
import {
    AUTH_STEP_UP_HEADER_NAME,
    readyCallOptions,
    toConnectCallOptions,
    type PolyesterMutationOptions,
} from "./request-options.js";

describe("toConnectCallOptions", () => {
    it("returns undefined for empty options", () => {
        expect(toConnectCallOptions()).toBeUndefined();
        expect(toConnectCallOptions({})).toBeUndefined();
    });

    it("passes through AbortSignal", () => {
        const controller = new AbortController();

        expect(toConnectCallOptions({ signal: controller.signal })?.signal).toBe(controller.signal);
    });

    it("passes through a valid timeoutMs", () => {
        expect(toConnectCallOptions({ timeoutMs: 5_000 })).toEqual({ timeoutMs: 5_000 });
        expect(toConnectCallOptions({ timeoutMs: 2_147_483_647 })?.timeoutMs).toBe(2_147_483_647);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
        "rejects timeoutMs %s",
        (timeoutMs) => {
            expect(() => toConnectCallOptions({ timeoutMs })).toThrow(ValidationError);
        },
    );

    it("sets a trimmed step-up header", () => {
        const options = toConnectCallOptions({ stepUpToken: " fresh-token " });

        expect(options?.headers?.get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
    });

    it("does not set a header for blank step-up tokens", () => {
        const controller = new AbortController();
        const input = {
            signal: controller.signal,
            stepUpToken: "   ",
        } satisfies PolyesterMutationOptions;

        const options = toConnectCallOptions(input);

        expect(options?.signal).toBe(controller.signal);
        expect(options?.headers).toBeUndefined();
    });
});

describe("readyCallOptions", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    function coldCatalog(delayMs: number) {
        const ready = new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        return { ready: () => ready };
    }

    it.each([250, 1_000])(
        "rejects with TimeoutError at the deadline during a %i ms catalog wait",
        async (delayMs) => {
            vi.useFakeTimers();
            const scales = coldCatalog(delayMs);
            const call = readyCallOptions(scales, { timeoutMs: 100 });
            const shared = readyCallOptions(scales);
            const outcome = expect(call).rejects.toBeInstanceOf(TimeoutError);

            await vi.advanceTimersByTimeAsync(100);
            await outcome;
            // Other callers still get the shared catalog load.
            await vi.advanceTimersByTimeAsync(delayMs);
            await expect(shared).resolves.toBeUndefined();
        },
    );

    it("rejects promptly when the signal aborts during the catalog wait", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const call = readyCallOptions(coldCatalog(1_000), { signal: controller.signal });
        const outcome = expect(call).rejects.toMatchObject({ name: "AbortError" });

        await vi.advanceTimersByTimeAsync(50);
        controller.abort();
        await outcome;
    });

    it("rejects an already-aborted signal without waiting for the catalog", async () => {
        const ready = vi.fn(() => new Promise<void>(() => {}));
        await expect(
            readyCallOptions({ ready }, { signal: AbortSignal.abort() }),
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(ready).not.toHaveBeenCalled();
    });

    it("passes only the time left to the call", async () => {
        vi.useFakeTimers();
        const call = readyCallOptions(coldCatalog(30), { timeoutMs: 100 });

        await vi.advanceTimersByTimeAsync(30);
        await expect(call).resolves.toEqual({ timeoutMs: 70 });
    });
});
