import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import {
    createOrderbookDataSchema,
    formatOrderbookLevel,
    GetOrderbookInputSchema,
} from "./orderbook.schemas.js";

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
    it("formats standalone levels as raw strings", () => {
        expect(
            formatOrderbookLevel({
                priceTicks: 100_000_000n,
                qtyScaled: 123_456_789n,
            }),
        ).toMatchObject({
            priceTicks: "100000000",
            qtyScaled: "123456789",
        });
    });

    it("formats price and quantity raw fields", () => {
        const schema = createOrderbookDataSchema();

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
            bids: [{ priceTicks: "100000000", qtyScaled: "100000000" }],
            asks: [{ priceTicks: "100250000", qtyScaled: "50000000" }],
        });
    });

    it("rejects malformed backend levels", () => {
        const schema = createOrderbookDataSchema();

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
