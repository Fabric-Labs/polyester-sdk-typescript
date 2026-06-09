import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createOrderbookDataSchema,
    formatOrderbookLevel,
    GetOrderbookInputSchema,
} from "./orderbook.schemas.js";

function seedPairCatalog() {
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
        name: "Tether USD",
        quantityDisplayDecimals: 2,
        quantityScale: 6,
    };

    return createTestCatalog({
        pairs: [
            {
                symbolId: 1,
                symbol: "BTC-USDT",
                baseAsset: btc,
                quoteAsset: usdt,
                tickSize: "0.01",
                stepSize: "0.000001",
                minNotionalQuote: "1",
                minQtyBase: "0.000001",
                allowBuyFeeFromReceived: false,
                defaultMarketSlippagePctBuy: 0.5,
                defaultMarketSlippagePctSell: 0.5,
                maxClientRefDriftPct: 0.1,
                listingAt: null,
                delistingAt: null,
                status: "enabled",
            },
        ],
    });
}

describe("GetOrderbookInputSchema", () => {
    it("defaults and rounds requested depths to public levels and private proto values", () => {
        const cases = [
            { input: { symbol: "BTC-USDT" }, depth: 50, protoDepth: Proto.Depth.DEPTH_50 },
            { input: { symbol: "BTC-USDT", depth: 1 }, depth: 1, protoDepth: Proto.Depth.DEPTH_1 },
            {
                input: { symbol: "BTC-USDT", depth: 37 },
                depth: 50,
                protoDepth: Proto.Depth.DEPTH_50,
            },
            {
                input: { symbol: "BTC-USDT", depth: 750 },
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
});

describe("OrderbookDataSchema", () => {
    it("formats standalone levels with the caller-provided pair catalog context", () => {
        const catalog = seedPairCatalog();

        expect(
            formatOrderbookLevel(catalog, 1, {
                priceTicks: 100_000_000n,
                qtyScaled: 123_456_789n,
            }),
        ).toMatchObject({
            priceDisplay: "100",
            qtyDisplay: "1.23456789",
        });
    });

    it("formats price and quantity display fields using the pair catalog", () => {
        const schema = createOrderbookDataSchema(seedPairCatalog().snapshot());

        const data = v.parse(schema, {
            symbol: "BTC-USDT",
            depth: 50,
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
        });

        expect(data).toMatchObject({
            symbol: "BTC-USDT",
            depth: 50,
            bookSeq: "12",
            bids: [{ priceDisplay: "100", qtyDisplay: "1" }],
            asks: [{ priceDisplay: "100.25", qtyDisplay: "0.5" }],
        });
    });

    it("rejects malformed backend levels", () => {
        const schema = createOrderbookDataSchema(seedPairCatalog().snapshot());

        expect(() =>
            v.parse(schema, {
                symbol: "BTC-USDT",
                depth: 50,
                bookSeq: 12n,
                bids: [{ priceTicks: 100_000_000n }],
                asks: [],
            }),
        ).toThrow();
    });
});
