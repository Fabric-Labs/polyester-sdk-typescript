import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableError } from "../utils/errors.js";
import { isAbortError, makeFetch, TransportError } from "./transports.js";

describe("makeFetch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rethrows abort errors unchanged", async () => {
        const abortError = new DOMException("Request aborted", "AbortError");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

        await expect(makeFetch()("https://api.test")).rejects.toBe(abortError);
        expect(isAbortError(abortError)).toBe(true);
    });

    it("wraps transport failures with the original cause", async () => {
        const cause = new TypeError("Failed to fetch");
        vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);

        await expect(makeFetch()("https://api.test")).rejects.toMatchObject({
            name: "TransportError",
            message: "Transport request failed",
            cause,
        });
    });

    it("passes through real HTTP 500 responses", async () => {
        const response = new Response("Backend failed", { status: 500 });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

        await expect(makeFetch()("https://api.test")).resolves.toBe(response);
    });
});

describe("isRetryableError", () => {
    it("does not retry abort errors", () => {
        const abortError = new DOMException("Request aborted", "AbortError");

        expect(isRetryableError(abortError)).toBe(false);
    });

    it("retries transport errors", () => {
        const err = new TransportError("Transport request failed", {
            cause: new TypeError("Failed to fetch"),
        });

        expect(isRetryableError(err)).toBe(true);
    });
});
