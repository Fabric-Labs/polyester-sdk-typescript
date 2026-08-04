import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { formatId } from "../../utils/base58-id.js";
import { createUserTradeSchema, GetUserTradesInputSchema } from "./trades.schemas.js";

const btc = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 8,
    quantityScale: 8,
};
const usdt = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

const btcUsdt: EnrichedPairConfig = {
    symbolId: 7,
    symbol: "BTC-USDT",
    baseAsset: btc,
    quoteAsset: usdt,
    tickSize: "0.000001",
    stepSize: "0.00000001",
    minNotionalQuote: "1",
    minQtyBase: "0.00000001",
    allowBuyFeeFromBase: false,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

function testScales() {
    const catalog = createTestCatalog({ pairs: [btcUsdt] });
    return createCatalogSdkScales(() => catalog);
}

function trade(overrides: Record<string, unknown> = {}) {
    return {
        orderId: 2n,
        symbolId: 7,
        side: ProtoOrders.Side.BUY,
        isMaker: false,
        feeAsset: ProtoOrders.FeeAsset.QUOTE,
        qtyScaled: 1234n,
        priceTicks: 1_000_000n,
        feeAmountE18: { hi: 0n, lo: 123n },
        referralShareAmountE18: { hi: 0n, lo: 45n },
        feeIsRebate: true,
        tsNs: 1n,
        matchId: 3n,
        ...overrides,
    };
}

describe("UserTradeSchema", () => {
    it("converts ids, enum labels, and decimal money fields", () => {
        const schema = createUserTradeSchema(testScales());

        expect(v.parse(schema, trade())).toEqual({
            orderId: formatId(2n),
            symbolId: 7,
            sideLabel: "buy",
            liquidityLabel: "taker",
            feeAsset: "quote",
            qty: "0.00001234",
            price: "1",
            fee: "0.000000000000000123",
            referralShare: "0.000000000000000045",
            feeIsRebate: true,
            tsNs: "1",
            tsIso: "1970-01-01T00:00:00.000Z",
            tsMs: 0,
            matchId: "3",
        });
    });

    it("uses exact E18 fee precision regardless of the fee asset quantity scale", () => {
        const schema = createUserTradeSchema(testScales());

        const parsed = v.parse(
            schema,
            trade({
                feeAsset: ProtoOrders.FeeAsset.BASE,
                feeAmountE18: { hi: 0n, lo: 123_456_789_012_345_678n },
            }),
        );

        expect(parsed.feeAsset).toBe("base");
        expect(parsed.fee).toBe("0.123456789012345678");
    });

    it("uses zero for an absent fee and preserves absent referral share", () => {
        const schema = createUserTradeSchema(testScales());
        const parsed = v.parse(
            schema,
            trade({ feeAmountE18: undefined, referralShareAmountE18: undefined }),
        );

        expect(parsed.fee).toBe("0");
        expect(parsed).not.toHaveProperty("referralShare");
        expect(parsed.feeIsRebate).toBe(true);
    });

    it("preserves user trades with an unspecified backend fee asset", () => {
        const schema = createUserTradeSchema(testScales());

        expect(
            v.parse(schema, trade({ feeAsset: ProtoOrders.FeeAsset.FEE_ASSET_UNSPECIFIED })),
        ).toMatchObject({ feeAsset: "unspecified" });
    });

    it("rejects user trades for symbols unknown to the catalog", () => {
        const schema = createUserTradeSchema(testScales());

        expect(() => v.parse(schema, trade({ symbolId: 999 }))).toThrow(/symbolId not found: 999/);
    });
});

describe("GetUserTradesInputSchema", () => {
    it("parses supplied timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {});

        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied timestamp filters", () => {
        expect(() => v.parse(GetUserTradesInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(GetUserTradesInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});
