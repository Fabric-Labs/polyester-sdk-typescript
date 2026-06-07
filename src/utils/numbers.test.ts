import { describe, expect, it } from "vitest";
import { parseOptionalUint64Decimal, parseOptionalUint64DecimalStrict } from "./numbers.js";

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
