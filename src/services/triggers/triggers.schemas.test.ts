import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { ListTriggerEventsInputSchema } from "./triggers.schemas.js";

describe("ListTriggerEventsInputSchema", () => {
    it("parses a supplied cursor", () => {
        const input = v.parse(ListTriggerEventsInputSchema, {
            triggerId: "11",
            beforeTsNs: " 100 ",
        });

        expect(input.triggerId).toBe(11n);
        expect(input.beforeTsNs).toBe(100n);
    });

    it("omits an absent cursor", () => {
        const input = v.parse(ListTriggerEventsInputSchema, { triggerId: "11" });

        expect(input.beforeTsNs).toBeUndefined();
    });

    it("rejects an invalid supplied cursor", () => {
        expect(() =>
            v.parse(ListTriggerEventsInputSchema, {
                triggerId: "11",
                beforeTsNs: "bad-cursor",
            }),
        ).toThrow();
    });
});
