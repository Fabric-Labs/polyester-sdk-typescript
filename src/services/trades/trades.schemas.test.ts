import { describe, expect, it } from "vitest";
import * as v from "valibot";
import type { EnrichedPairConfig } from "../../catalogs/index.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { createUserTradeSchema, GetUserTradesInputSchema } from "./trades.schemas.js";

const baseAsset = {
    symbol: "BASE",
    ledgerId: 1,
    name: "Base",
    quantityDisplayDecimals: 4,
    quantityScale: 4,
};

const quoteAsset = {
    symbol: "QUOTE",
    ledgerId: 2,
    name: "Quote",
    quantityDisplayDecimals: 2,
    quantityScale: 2,
};

const pair: EnrichedPairConfig = {
    symbolId: 7,
    symbol: "BASE-QUOTE",
    baseAsset,
    quoteAsset,
    tickSize: "0.01",
    stepSize: "0.0001",
    minNotionalQuote: "1",
    minQtyBase: "0.0001",
    allowBuyFeeFromReceived: true,
    defaultMarketSlippagePctBuy: 0,
    defaultMarketSlippagePctSell: 0,
    maxClientRefDriftPct: 0,
    listingAt: null,
    delistingAt: null,
    status: "enabled",
};

function trade(overrides: Record<string, unknown> = {}) {
    return {
        tradeId: 1n,
        orderId: 2n,
        symbolId: 7,
        side: ProtoOrders.Side.BUY,
        isMaker: false,
        feeSource: ProtoOrders.FeeSource.QUOTE,
        qtyScaled: 1234n,
        priceTicks: 1_000_000n,
        feeScaled: 123n,
        tsNs: 1n,
        matchId: 3n,
        ...overrides,
    };
}

describe("UserTradeSchema", () => {
    it("formats fees using the fee asset scale from the catalog", () => {
        const schema = createUserTradeSchema(createTestCatalog({ pairs: [pair] }).snapshot());

        expect(v.parse(schema, trade({ feeSource: ProtoOrders.FeeSource.QUOTE }))).toMatchObject({
            feeAsset: quoteAsset,
            fee: 1.23,
        });
        expect(
            v.parse(
                schema,
                trade({
                    feeSource: ProtoOrders.FeeSource.RECEIVED,
                    feeScaled: 123n,
                }),
            ),
        ).toMatchObject({
            feeAsset: baseAsset,
            fee: 0.0123,
        });
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
