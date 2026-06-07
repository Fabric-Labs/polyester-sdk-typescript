import { describe, expect, it } from "vitest";
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
