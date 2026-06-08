import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { createOrderbookDataSchema, GetOrderbookInputSchema } from "./orderbook.schemas.js";

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
    it("defaults and rounds requested depths to supported proto enum values", () => {
        const cases = [
            { input: { symbol: "BTC-USDT" }, expected: Proto.Depth.DEPTH_50 },
            { input: { symbol: "BTC-USDT", depth: 1 }, expected: Proto.Depth.DEPTH_1 },
            { input: { symbol: "BTC-USDT", depth: 37 }, expected: Proto.Depth.DEPTH_50 },
            { input: { symbol: "BTC-USDT", depth: 750 }, expected: Proto.Depth.DEPTH_500 },
        ];

        for (const testCase of cases) {
            expect(v.parse(GetOrderbookInputSchema, testCase.input).depth).toBe(testCase.expected);
        }
    });
});

describe("OrderbookDataSchema", () => {
    it("formats price and quantity display fields using the pair catalog", () => {
        const schema = createOrderbookDataSchema(seedPairCatalog().snapshot());

        const data = v.parse(schema, {
            symbol: "BTC-USDT",
            depth: Proto.Depth.DEPTH_50,
            bookSeq: 12n,
            bids: [{ priceTicks: 100_000_000n, qtyScaled: 100_000_000n }],
            asks: [{ priceTicks: 100_250_000n, qtyScaled: 50_000_000n }],
        });

        expect(data).toMatchObject({
            symbol: "BTC-USDT",
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
                depth: Proto.Depth.DEPTH_50,
                bookSeq: 12n,
                bids: [{ priceTicks: 100_000_000n }],
                asks: [],
            }),
        ).toThrow();
    });
});
