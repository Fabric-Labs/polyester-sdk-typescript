import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import {
    BalanceHistoryInputSchema,
    createLedgerBalanceSchema,
    EquityHistoryInputSchema,
} from "./balances.schemas.js";
import * as v from "valibot";

const LedgerBalanceSchema = createLedgerBalanceSchema();

describe("ledger balance schema", () => {
    it("maps generated trading balances to unified output balances", () => {
        const balance = v.parse(LedgerBalanceSchema, {
            assetId: 1,
            trading: { hi: 0n, lo: 1_000_000_000_000_000_000n },
            funding: { hi: 0n, lo: 0n },
            reserved: { hi: 0n, lo: 0n },
            available: { hi: 0n, lo: 1_000_000_000_000_000_000n },
        });

        expect(balance.assetId).toBe(1);
        expect(balance.unifiedQ).toBe("1000000000000000000");
        expect(balance.availableQ).toBe("1000000000000000000");
    });
});

describe("balance history input schemas", () => {
    it("maps balance ranges, subaccounts, and defaults to proto inputs", () => {
        const input = v.parse(BalanceHistoryInputSchema, {
            account: { subaccountId: " 12 " },
            range: "90d",
        });

        expect(input).toEqual({
            subaccountId: 12n,
            range: Proto.BalanceRange.DAY_90,
            ledger: 0,
            accountCodes: [],
        });
    });

    it("maps equity group defaults and explicit asset grouping", () => {
        const defaultInput = v.parse(EquityHistoryInputSchema, {
            range: "1d",
        });
        const assetInput = v.parse(EquityHistoryInputSchema, {
            range: "365d",
            groupBy: "asset",
            accountCodes: [301],
        });

        expect(defaultInput.groupBy).toBe(Proto.EquityGroupBy.GROUP_BY_ACCOUNT);
        expect(assetInput).toEqual({
            subaccountId: undefined,
            range: Proto.BalanceRange.DAY_365,
            accountCodes: [301],
            groupBy: Proto.EquityGroupBy.GROUP_BY_ASSET,
        });
    });

    it("rejects proto enum input for range and groupBy", () => {
        expect(() =>
            v.parse(BalanceHistoryInputSchema, {
                range: Proto.BalanceRange.DAY_1,
            }),
        ).toThrow();
        expect(() =>
            v.parse(EquityHistoryInputSchema, {
                range: "1d",
                groupBy: Proto.EquityGroupBy.GROUP_BY_ASSET,
            }),
        ).toThrow();
    });
});
