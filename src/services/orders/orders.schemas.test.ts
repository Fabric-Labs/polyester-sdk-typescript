import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { OrderHistoryInputSchema } from "./orders.schemas.js";

describe("OrderHistoryInputSchema", () => {
    it("parses supplied timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent timestamp filters", () => {
        const input = v.parse(OrderHistoryInputSchema, {});

        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied timestamp filters", () => {
        expect(() => v.parse(OrderHistoryInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(OrderHistoryInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});
