import { describe, expect, expectTypeOf, it } from "vitest";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { AccountCode } from "../../gen/ledger/v1/catalog_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import {
    BalanceHistoryInputSchema,
    createBalanceHistoryResponseSchema,
    createEquityHistoryResponseSchema,
    createLedgerBalanceSchema,
    EquityHistoryInputSchema,
} from "./balances.schemas.js";
import * as v from "valibot";

const usdt = {
    symbol: "USDT",
    ledgerId: 1,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};
const doge = {
    symbol: "DOGE",
    ledgerId: 19,
    name: "Dogecoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};

function testScales() {
    const catalog = createTestCatalog({ assets: [usdt, doge] });
    return createCatalogSdkScales(() => catalog);
}

const onePointFiveE18 = 1_500_000_000_000_000_000n;

describe("ledger balance schema", () => {
    it("maps generated trading balances to decimal output balances", () => {
        const balance = v.parse(createLedgerBalanceSchema(), {
            assetId: 1,
            trading: { hi: 0n, lo: onePointFiveE18 },
            funding: { hi: 0n, lo: 0n },
            reserved: { hi: 0n, lo: 0n },
            available: { hi: 0n, lo: onePointFiveE18 },
            tradingRevision: 101n,
            fundingRevision: 102n,
        });

        expect(balance.assetId).toBe(1);
        expect(balance.trading).toBe("1.5");
        expect(balance.available).toBe("1.5");
        expect(balance.funding).toBe("0");
        expect(balance.reserved).toBe("0");
        expect(balance).toMatchObject({
            tradingRevision: "101",
            fundingRevision: "102",
        });
        expectTypeOf(balance).toMatchTypeOf<{
            tradingRevision: string;
            fundingRevision: string;
        }>();
    });

    it("preserves balances for assets unknown to the catalog", () => {
        expect(
            v.parse(createLedgerBalanceSchema(), {
                assetId: 404,
                trading: { hi: 0n, lo: 1n },
            }),
        ).toEqual({
            assetId: 404,
            funding: "0",
            trading: "0.000000000000000001",
            reserved: "0",
            available: "0",
            tradingRevision: "0",
            fundingRevision: "0",
        });
    });
});

describe("balance history response schema", () => {
    it("converts balance series values via the fixed history scale", () => {
        const history = v.parse(createBalanceHistoryResponseSchema(), {
            range: Proto.BalanceRange.DAY_7,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            series: [
                {
                    assetId: 1,
                    accountCode: AccountCode.TRADING,
                    balanceQ: [100_000_000n, 125_000_000n],
                },
                {
                    assetId: 19,
                    accountCode: AccountCode.FUNDING,
                    balanceQ: [4_893_848_400n, 0n],
                },
            ],
        });

        expect(history.series).toEqual([
            { assetId: 1, accountCode: "trading", balance: ["10", "12.5"] },
            { assetId: 19, accountCode: "funding", balance: ["489.38484", "0"] },
        ]);
    });
});

describe("equity history response schema", () => {
    it("converts equity at the fixed 1e4 scale and btc prices at the price-tick scale", () => {
        const history = v.parse(createEquityHistoryResponseSchema(testScales()), {
            range: Proto.BalanceRange.DAY_30,
            bucket: "1d",
            startTsSec: 100,
            endTsSec: 200,
            quoteAsset: "USDT",
            points: 2,
            series: [
                {
                    grouping: { case: "asset", value: { id: 7, symbol: "BTC" } },
                    equityQ: [12_345n, -100n],
                },
            ],
            btcPricesQ: [65_000_123_456n],
        });

        expect(history.series).toEqual([
            {
                grouping: { type: "asset", assetId: 7, symbol: "BTC" },
                equity: ["1.2345", "-0.01"],
            },
        ]);
        expect(history.btcPrices).toEqual(["65000.123456"]);
    });
});

describe("balance history input schemas", () => {
    it("maps balance ranges, subaccounts, and defaults to proto inputs", () => {
        const input = v.parse(BalanceHistoryInputSchema, {
            account: { subaccountId: ` ${formatId(12n)} ` },
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
            accountCodes: ["trading"],
        });

        expect(defaultInput.groupBy).toBe(Proto.EquityGroupBy.GROUP_BY_ACCOUNT);
        expect(assetInput).toEqual({
            subaccountId: undefined,
            range: Proto.BalanceRange.DAY_365,
            accountCodes: [AccountCode.TRADING],
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
