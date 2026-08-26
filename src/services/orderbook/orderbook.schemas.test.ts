import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createCatalogSdkScales } from "../../shared/decimal-surface.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createOrderbookDataSchema,
    formatOrderbookLevel,
    GetOrderbookInputSchema,
} from "./orderbook.schemas.js";

const BTC = {
    symbol: "BTC",
    ledgerId: 1,
    name: "Bitcoin",
    quantityDisplayDecimals: 5,
    quantityScale: 8,
};

const USDT = {
    symbol: "USDT",
    ledgerId: 2,
    name: "Tether",
    quantityDisplayDecimals: 2,
    quantityScale: 6,
};

const BTC_USDT = {
    symbolId: 101,
    symbol: "BTC-USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    tickSize: "0.01",
    stepSize: "0.0001",
    minNotionalQuote: "10",
    minQtyBase: "0.0001",
    allowBuyFeeFromBase: false,
    defaultMarketSlippagePctBuy: 1,
    defaultMarketSlippagePctSell: 1,
    maxClientRefDriftPct: 1,
    baseQuantityScale: 8,
    quoteQuantityScale: 6,
    status: "enabled",
} as const;

function testScales() {
    return createCatalogSdkScales(() =>
        createTestCatalog({ assets: [BTC, USDT], pairs: [BTC_USDT] }),
    );
}

describe("GetOrderbookInputSchema", () => {
    it("defaults and rounds requested depths to public levels and private proto values", () => {
        const cases = [
            { input: { symbolId: 101 }, depth: 50, protoDepth: Proto.Depth.DEPTH_50 },
            {
                input: { symbolId: 101, depth: 1 },
                depth: 1,
                protoDepth: Proto.Depth.DEPTH_1,
            },
            {
                input: { symbolId: 101, depth: 37 },
                depth: 50,
                protoDepth: Proto.Depth.DEPTH_50,
            },
            {
                input: { symbolId: 101, depth: 750 },
                depth: 500,
                protoDepth: Proto.Depth.DEPTH_500,
            },
        ];

        for (const testCase of cases) {
            const parsed = v.parse(GetOrderbookInputSchema, testCase.input);
            expect(parsed.depth).toBe(testCase.depth);
            expect(parsed.protoDepth).toBe(testCase.protoDepth);
        }
    });

    it("accepts the uint32 symbol ID ceiling and rejects invalid IDs", () => {
        expect(v.parse(GetOrderbookInputSchema, { symbolId: PROTOBUF_UINT32_MAX }).symbolId).toBe(
            PROTOBUF_UINT32_MAX,
        );
        expect(() => v.parse(GetOrderbookInputSchema, { symbolId: 0 })).toThrow();
        expect(() =>
            v.parse(GetOrderbookInputSchema, { symbolId: PROTOBUF_UINT32_MAX + 1 }),
        ).toThrow();
        expect(() => v.parse(GetOrderbookInputSchema, { symbol: "BTC-USDT" })).toThrow();
    });
});

describe("OrderbookDataSchema", () => {
    it("formats standalone levels as decimal strings", () => {
        expect(
            formatOrderbookLevel(
                {
                    priceTicks: 100_000_000n,
                    qtyScaled: 123_456_789n,
                },
                testScales(),
                101,
            ),
        ).toEqual({
            price: "100",
            qty: "1.23456789",
        });
    });

    it("converts price and quantity fields to decimal strings", () => {
        const schema = createOrderbookDataSchema(testScales(), 101);

        const data = v.parse(schema, {
            symbolId: 101,
            depth: 50,
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
        });

        expect(data).toMatchObject({
            symbolId: 101,
            depth: 50,
            bookSeq: "12",
            bids: [{ price: "100", qty: "1" }],
            asks: [{ price: "100.25", qty: "0.5" }],
        });
    });

    it("rejects malformed backend levels", () => {
        const schema = createOrderbookDataSchema(testScales(), 101);

        expect(() =>
            v.parse(schema, {
                symbolId: 101,
                depth: 50,
                bookSeq: 12n,
                bids: [{ priceTicks: 100_000_000n }],
                asks: [],
            }),
        ).toThrow();
    });
});
