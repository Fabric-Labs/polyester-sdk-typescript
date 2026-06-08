import { describe, expect, it } from "vitest";
import * as v from "valibot";

import type { CatalogReader, CatalogSnapshot, EnrichedPairConfig } from "../../catalogs/index.js";
import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import { createTestCatalog } from "../../testing/catalog.js";
import { createCandlesSchemas, createListCandlesInputSchema } from "./candles.schemas.js";

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
    quantityDisplayDecimals: 6,
    quantityScale: 6,
};

function pair(symbolId: number): EnrichedPairConfig {
    return {
        symbolId,
        symbol: "BTC-USDT",
        baseAsset: btc,
        quoteAsset: usdt,
        tickSize: "0.000001",
        stepSize: "0.00000001",
        minNotionalQuote: "1",
        minQtyBase: "0.00000001",
        allowBuyFeeFromReceived: false,
        defaultMarketSlippagePctBuy: 0,
        defaultMarketSlippagePctSell: 0,
        maxClientRefDriftPct: 0,
        listingAt: null,
        delistingAt: null,
        status: "enabled",
    };
}

function catalogForPair(pair: EnrichedPairConfig) {
    return createTestCatalog({ assets: [btc, usdt], pairs: [pair] });
}

describe("ListCandlesInputSchema", () => {
    it("maps explicit timeframe values to proto values", () => {
        const schema = createListCandlesInputSchema(catalogForPair(pair(1)).snapshot());
        const input = v.parse(schema, {
            symbolId: 1,
            timeframe: "1mo",
            startTsSec: 100,
            endTsSec: 200,
        });

        expect(input.timeframe).toBe(Proto.Timeframe.MONTH_1);
        expect(input.startTime).toEqual({ seconds: 100n, nanos: 0 });
        expect(input.endTime).toEqual({ seconds: 200n, nanos: 0 });
    });

    it("rejects timeframe aliases, proto enum input, and timestamp coercion", () => {
        const schema = createListCandlesInputSchema(catalogForPair(pair(1)).snapshot());

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1M",
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: Proto.Timeframe.SEC_1,
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: "100",
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: 100n,
            }),
        ).toThrow();

        expect(() =>
            v.parse(schema, {
                symbolId: 1,
                timeframe: "1m",
                startTsSec: -1,
            }),
        ).toThrow();
    });
});

describe("createCandlesSchemas", () => {
    it("resolves symbols from the injected catalog", () => {
        const catalog = catalogForPair(pair(101));
        const schemas = createCandlesSchemas(catalog).current();

        const input = v.parse(schemas.listCandlesInput, {
            symbol: "BTC-USDT",
            timeframe: "1m",
        });

        expect(input.symbolId).toBe(101);
    });

    it("rebuilds after a snapshot swap while existing bundles stay pinned", () => {
        const firstCatalog = catalogForPair(pair(101));
        const secondCatalog = catalogForPair(pair(202));
        let currentSnapshot: CatalogSnapshot = firstCatalog.snapshot();
        const catalog = {
            ...firstCatalog,
            snapshot: () => currentSnapshot,
        } satisfies CatalogReader;
        const cache = createCandlesSchemas(catalog);
        const firstBundle = cache.current();

        currentSnapshot = secondCatalog.snapshot();

        const pinnedInput = v.parse(firstBundle.listCandlesInput, {
            symbol: "BTC-USDT",
            timeframe: "1m",
        });
        const pinnedCandle = v.parse(firstBundle.candleRow, {
            symbolId: 101,
            timeframe: Proto.Timeframe.MIN_1,
            tsSec: 100n,
            open: 1_000_000n,
            high: 2_000_000n,
            low: 900_000n,
            close: 1_500_000n,
            volume: 123_456_789n,
        });
        const refreshedInput = v.parse(cache.current().listCandlesInput, {
            symbol: "BTC-USDT",
            timeframe: "1m",
        });

        expect(pinnedInput.symbolId).toBe(101);
        expect(pinnedCandle.symbolId).toBe(101);
        expect(refreshedInput.symbolId).toBe(202);
    });
});
