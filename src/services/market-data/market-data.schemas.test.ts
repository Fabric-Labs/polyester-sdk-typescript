import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import {
    createGetMarketTradesInputSchema,
    createMarketTradeSchema,
    SpotConfigSchema,
} from "./market-data.schemas.js";

describe("market data schemas", () => {
    it("maps market trade filters to proto request fields", () => {
        const schema = createGetMarketTradesInputSchema();

        const input = v.parse(schema, {
            symbolId: 101,
            side: "sell",
            startTsNs: " 1700000000123456789 ",
            endTsNs: "1700000001123456789",
            limit: " 50 ",
        });

        expect(input).toEqual({
            symbolId: 101,
            side: Proto.SideFilter.SELL,
            startTime: { seconds: 1_700_000_000n, nanos: 123_456_789 },
            endTime: { seconds: 1_700_000_001n, nanos: 123_456_789 },
            limit: 50,
        });
    });

    it("omits absent optional trade filters", () => {
        const schema = createGetMarketTradesInputSchema();

        const input = v.parse(schema, { symbolId: 101 });

        expect(input).toEqual({
            symbolId: 101,
            side: undefined,
            startTime: undefined,
            endTime: undefined,
            limit: undefined,
        });
    });

    it("rejects invalid trade filter inputs", () => {
        const schema = createGetMarketTradesInputSchema();
        const cases = [
            { symbolId: 0 },
            { symbolId: 101, side: "both" },
            { symbolId: 101, startTsNs: "not-a-ts" },
            { symbolId: 101, endTsNs: "12.3" },
        ];

        for (const input of cases) {
            expect(() => v.parse(schema, input)).toThrow();
        }
    });

    it("parses public trades with raw numeric fields", () => {
        const schema = createMarketTradeSchema();

        const trade = v.parse(schema, {
            symbolId: 101,
            matchId: 22n,
            isBuy: false,
            priceTicks: 1_234_567n,
            qtyScaled: 123_456_789n,
            tsNs: 1_700_000_000_000_000_000n,
        });

        expect(trade).toMatchObject({
            symbolId: 101,
            sideLabel: "sell",
            qtyScaled: "123456789",
            priceTicks: "1234567",
            tsMs: 1_700_000_000_000,
        });
    });

    it("parses spot config defaults and timestamp fields", () => {
        const config = v.parse(SpotConfigSchema, {
            assets: [
                {
                    asset: "BTC",
                    ledgerId: 1,
                    name: "Bitcoin",
                    quantityDisplayDecimals: 8,
                    quantityScale: 8,
                },
            ],
            pairs: [
                {
                    symbolId: 101,
                    symbol: "BTC-USDT",
                    baseAsset: "BTC",
                    quoteAsset: "USDT",
                    tickSize: "0.000001",
                    stepSize: "0.00000001",
                    minNotionalQuote: "1",
                    minQtyBase: "0.00000001",
                    allowBuyFeeFromReceived: false,
                    baseQuantityScale: 8,
                    quoteQuantityScale: 6,
                    listingAt: { seconds: 1_700_000_000n, nanos: 0 },
                    status: "enabled",
                },
            ],
            tsSec: 123n,
        });

        expect(config.assets[0]).toEqual({
            symbol: "BTC",
            ledgerId: 1,
            name: "Bitcoin",
            quantityDisplayDecimals: 8,
            quantityScale: 8,
        });
        expect(config.pairs[0]).toMatchObject({
            symbolId: 101,
            defaultMarketSlippagePctBuy: 0,
            defaultMarketSlippagePctSell: 0,
            maxClientRefDriftPct: 0,
            listingAt: 1_700_000_000_000,
            status: "enabled",
        });
        expect(config.tsSec).toBe(123_000);
    });
});
