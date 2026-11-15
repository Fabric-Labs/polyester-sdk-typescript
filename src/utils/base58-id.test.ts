import { describe, expect, it } from "vitest";
import { ValidationError } from "../shared/errors.js";
import { formatId, idToBigInt } from "./base58-id.js";

describe("base58 public IDs", () => {
    it.each([0n, 1n, 58n, 59n, (1n << 64n) - 1n])(
        "round-trips %s even when its base58 form contains only digits",
        (id) => {
            expect(idToBigInt(formatId(id))).toBe(id);
        },
    );

    it("treats every string as base58 and keeps numeric debug inputs decimal", () => {
        expect(formatId(1n)).toBe("2");
        expect(idToBigInt("2")).toBe(1n);
        expect(idToBigInt(2n)).toBe(2n);
        expect(idToBigInt(2)).toBe(2n);
    });

    it("rejects number inputs that have already lost integer precision", () => {
        expect(() => idToBigInt(Number.MAX_SAFE_INTEGER + 1)).toThrow("invalid number");
    });

    it("rejects a missing ID from untyped callers with ValidationError", () => {
        const missing = () => idToBigInt(undefined as unknown as string, "accountId");
        expect(missing).toThrow(ValidationError);
        expect(missing).toThrow("accountId: empty");
    });

    it("round-trips a sequential sample without digit-only ambiguity", () => {
        for (let id = 0n; id < 100_000n; id++) {
            expect(idToBigInt(formatId(id))).toBe(id);
        }
    });
});
