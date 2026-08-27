import { describe, expect, it } from "vitest";
import {
    parseOptionalPositiveBigIntLike,
    parseOptionalPositiveIntLike,
    parseOptionalUint64Decimal,
    parseOptionalUint64DecimalStrict,
} from "./numbers.js";

describe("parseOptionalPositiveIntLike", () => {
    it("parses positive integer numbers and strings", () => {
        expect(parseOptionalPositiveIntLike(1)).toBe(1);
        expect(parseOptionalPositiveIntLike(" 42 ")).toBe(42);
    });

    it.each([0.5, "0.5", 0.9, "0.9", -0.5, "-0.5", 1.5, "1.5"])(
        "rejects fractional input %j",
        (value) => {
            expect(parseOptionalPositiveIntLike(value)).toBeUndefined();
        },
    );

    it.each(["0x10", "1e2", "+20", "1_000", Number.MAX_SAFE_INTEGER + 1])(
        "rejects non-decimal or unsafe integer input %j",
        (value) => {
            expect(parseOptionalPositiveIntLike(value)).toBeUndefined();
        },
    );
});

describe("parseOptionalPositiveBigIntLike", () => {
    it("preserves large decimal strings", () => {
        expect(parseOptionalPositiveBigIntLike(" 18446744073709551615 ")).toBe(
            18_446_744_073_709_551_615n,
        );
    });

    it.each(["0x10", "1e2", "1_000", 1e300])("rejects invalid input %j", (value) => {
        expect(parseOptionalPositiveBigIntLike(value)).toBeUndefined();
    });
});

describe("parseOptionalUint64DecimalStrict", () => {
    it("parses trimmed decimal strings", () => {
        expect(parseOptionalUint64DecimalStrict(" 123 ", "cursor")).toBe(123n);
    });

    it("omits absent and blank values", () => {
        expect(parseOptionalUint64DecimalStrict(undefined, "cursor")).toBeUndefined();
        expect(parseOptionalUint64DecimalStrict("", "cursor")).toBeUndefined();
        expect(parseOptionalUint64DecimalStrict("   ", "cursor")).toBeUndefined();
    });

    it("rejects invalid supplied values", () => {
        expect(() => parseOptionalUint64DecimalStrict("abc", "cursor")).toThrow(
            "cursor must be a positive integer",
        );
        expect(() => parseOptionalUint64DecimalStrict("12.3", "cursor")).toThrow();
        expect(() => parseOptionalUint64DecimalStrict("-1", "cursor")).toThrow();
    });
});

describe("parseOptionalUint64Decimal", () => {
    it("keeps invalid values permissive for existing callers", () => {
        expect(parseOptionalUint64Decimal("abc")).toBeUndefined();
    });
});
