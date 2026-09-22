import { fc, it } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
    compareUnsignedIntegerStrings,
    shouldApplyReconciliationUpdate,
} from "./reconciliation.js";

const unsignedInteger = fc
    .tuple(
        fc.integer({ min: 0, max: 12 }),
        fc.string({
            unit: fc.constantFrom(..."0123456789"),
            minLength: 1,
            maxLength: 48,
        }),
    )
    .map(([leadingZeros, digits]) => `${"0".repeat(leadingZeros)}${digits}`);

function bigintOrder(left: string, right: string): -1 | 0 | 1 {
    const delta = BigInt(left) - BigInt(right);
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

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

    it.prop([unsignedInteger, unsignedInteger])(
        "orders unsigned integer strings like bigint, including leading zeros",
        (left, right) => {
            expect(compareUnsignedIntegerStrings(left, right)).toBe(bigintOrder(left, right));
        },
    );

    it.prop([unsignedInteger, unsignedInteger])("is antisymmetric", (left, right) => {
        expect(
            compareUnsignedIntegerStrings(left, right) + compareUnsignedIntegerStrings(right, left),
        ).toBe(0);
    });

    it.prop([unsignedInteger, unsignedInteger, unsignedInteger])(
        "is transitive",
        (left, middle, right) => {
            const leftToMiddle = compareUnsignedIntegerStrings(left, middle);
            const middleToRight = compareUnsignedIntegerStrings(middle, right);
            const leftToRight = compareUnsignedIntegerStrings(left, right);
            if (leftToMiddle <= 0 && middleToRight <= 0) {
                expect(leftToRight).toBeLessThanOrEqual(0);
            }
            if (leftToMiddle >= 0 && middleToRight >= 0) {
                expect(leftToRight).toBeGreaterThanOrEqual(0);
            }
        },
    );

    it.prop([
        fc.option(unsignedInteger, { nil: undefined }),
        fc.option(unsignedInteger, { nil: undefined }),
    ])("applies only a strictly newer known version", (existing, incoming) => {
        const applied = shouldApplyReconciliationUpdate(existing, incoming);
        if (existing === undefined) {
            expect(applied).toBe(true);
            return;
        }
        if (incoming === undefined) {
            expect(applied).toBe(false);
            return;
        }
        expect(applied).toBe(BigInt(incoming) > BigInt(existing));
    });
});
