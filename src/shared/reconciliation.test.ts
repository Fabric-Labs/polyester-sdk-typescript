import { describe, expect, it } from "vitest";
import {
    compareUnsignedIntegerStrings,
    shouldApplyReconciliationUpdate,
} from "./reconciliation.js";

describe("reconciliation helpers", () => {
    it("compares exact integers beyond Number precision", () => {
        expect(compareUnsignedIntegerStrings("1700000000000000001", "1700000000000000000")).toBe(1);
        expect(compareUnsignedIntegerStrings("0009", "9")).toBe(0);
        expect(compareUnsignedIntegerStrings("99", "100")).toBe(-1);
    });

    it("only applies strictly newer known versions", () => {
        expect(shouldApplyReconciliationUpdate("10", "11")).toBe(true);
        expect(shouldApplyReconciliationUpdate("10", "10")).toBe(false);
        expect(shouldApplyReconciliationUpdate("10", "9")).toBe(false);
        expect(shouldApplyReconciliationUpdate(undefined, "9")).toBe(true);
        expect(shouldApplyReconciliationUpdate(undefined, undefined)).toBe(true);
        expect(shouldApplyReconciliationUpdate("10", undefined)).toBe(false);
    });
});
