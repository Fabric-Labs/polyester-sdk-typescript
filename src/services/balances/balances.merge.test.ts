import { describe, expect, expectTypeOf, it } from "vitest";
import type { LedgerBalance } from "./balances.schemas.js";
import { mergeLedgerBalances } from "./balances.merge.js";

function balance(overrides: Partial<LedgerBalance> = {}): LedgerBalance {
    return {
        assetId: 1,
        trading: "10",
        funding: "5",
        reserved: "2",
        available: "8",
        tradingRevision: "20",
        fundingRevision: "20",
        ...overrides,
    };
}

describe("mergeLedgerBalances", () => {
    it("uses the incoming row when there is no existing balance", () => {
        const incoming = balance();

        expect(mergeLedgerBalances(undefined, incoming)).toBe(incoming);
    });

    it("rejects rows for different assets", () => {
        expect(() => mergeLedgerBalances(balance(), balance({ assetId: 2 }))).toThrow(
            "Cannot merge ledger balances for different assets",
        );
    });

    it("merges the trading tuple atomically and funding independently", () => {
        const result = mergeLedgerBalances(
            balance(),
            balance({
                trading: "11",
                funding: "99",
                reserved: "7",
                available: "999",
                tradingRevision: "21",
                fundingRevision: "19",
            }),
        );

        expect(result).toEqual({
            assetId: 1,
            trading: "11",
            funding: "5",
            reserved: "7",
            available: "999",
            tradingRevision: "21",
            fundingRevision: "20",
        });
        expectTypeOf(result.tradingRevision).toEqualTypeOf<string>();
    });

    it("returns the existing object for equal and stale component revisions", () => {
        const existing = balance();
        const incoming = balance({
            trading: "100",
            funding: "100",
            reserved: "100",
            tradingRevision: "00020",
            fundingRevision: "19",
        });

        expect(mergeLedgerBalances(existing, incoming)).toBe(existing);
    });

    it("uses the incoming event when neither row has revisions", () => {
        const existing = balance({
            tradingRevision: "0",
            fundingRevision: "0",
        });
        const incoming = balance({
            trading: "12",
            available: "10",
            tradingRevision: "0",
            fundingRevision: "0",
        });

        expect(mergeLedgerBalances(existing, incoming)).toBe(incoming);
    });

    it("preserves the server-authoritative available amount", () => {
        const result = mergeLedgerBalances(
            balance({
                trading: "1000.000000000000000001",
                reserved: "1",
                available: "999.000000000000000001",
            }),
            balance({
                trading: "1000",
                reserved: "0.2",
                available: "123456789",
                tradingRevision: "21",
            }),
        );

        expect(result.available).toBe("123456789");
    });

    it("preserves exact values beyond Number's safe integer range", () => {
        const result = mergeLedgerBalances(
            balance({
                trading: "1",
                reserved: "0.000000000000000001",
                tradingRevision: "18446744073709551616000000000000000000",
            }),
            balance({
                trading: "340282366920938463463.374607431768211455",
                tradingRevision: "18446744073709551616000000000000000001",
            }),
        );

        expect(result.available).toBe("8");
        expect(result.tradingRevision).toBe("18446744073709551616000000000000000001");
    });
});
