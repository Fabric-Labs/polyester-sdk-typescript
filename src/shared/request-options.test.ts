import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors.js";
import {
    AUTH_STEP_UP_HEADER_NAME,
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
