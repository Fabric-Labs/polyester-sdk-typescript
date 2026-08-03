import { describe, expect, it } from "vitest";
import { createTestCatalog } from "../testing/catalog.js";

describe("market data catalog", () => {
    const catalog = createTestCatalog({
        assets: [
            {
                symbol: "TEST",
                ledgerId: 1,
                name: "Test Asset",
                quantityDisplayDecimals: 2,
                quantityScale: 6,
            },
            {
                symbol: "USDT",
                ledgerId: 2,
                name: "Tether USD",
                quantityDisplayDecimals: 2,
                quantityScale: 6,
            },
        ],
        pairs: [
            {
                symbolId: 1,
                symbol: "TEST-USDT",
                baseAsset: "TEST",
                quoteAsset: "USDT",
                tickSize: "0.01",
                stepSize: "0.000001",
                minNotionalQuote: "1",
                minQtyBase: "0.000001",
                allowBuyFeeFromBase: true,
                defaultMarketSlippagePctBuy: 1,
                defaultMarketSlippagePctSell: 1,
                maxClientRefDriftPct: 1,
                baseQuantityScale: 6,
                quoteQuantityScale: 6,
                status: "enabled",
            },
        ],
    });

    it("returns unknown asset for unresolved ledger ids", () => {
        expect(catalog.market.getAssetBySymbol("NOT_REAL")).toBeNull();
        expect(catalog.market.getAssetByLedgerId(999_999)).toMatchObject({
            symbol: "Unknown asset",
            ledgerId: 9999,
        });
        expect(catalog.ledger.isKnownAssetId(999_999)).toBe(false);
    });

    it("throws for unknown pair lookups", () => {
        expect(() => catalog.market.requirePairBySymbol("NOT_REAL-USDT")).toThrow(
            "market symbol not found: NOT_REAL-USDT",
        );
        expect(() => catalog.market.requirePairBySymbolId(999_999)).toThrow(
            "market symbolId not found: 999999",
        );
        expect(catalog.market.getSymbolIdByPairSymbol("NOT_REAL-USDT")).toBeNull();
    });
});
