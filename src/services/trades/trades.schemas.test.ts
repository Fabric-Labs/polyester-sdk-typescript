import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { GetUserTradesInputSchema } from "./trades.schemas.js";

describe("GetUserTradesInputSchema", () => {
    it("parses supplied timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {});

        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied timestamp filters", () => {
        expect(() => v.parse(GetUserTradesInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(GetUserTradesInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});
