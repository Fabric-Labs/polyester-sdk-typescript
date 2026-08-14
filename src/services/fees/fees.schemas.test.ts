import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { GetSpotFeeRatesInputSchema, SpotFeeRateSchema } from "./fees.schemas.js";

describe("GetSpotFeeRatesInputSchema", () => {
    it("maps account scope and symbol filters onto the proto request", () => {
        expect(
            v.parse(GetSpotFeeRatesInputSchema, {
                account: { subaccountId: "42" },
                symbolIds: [101, 202],
            }),
        ).toEqual({
            subaccountId: 42n,
            symbolId: [101, 202],
        });
    });

    it("dedupes symbol identifiers", () => {
        expect(
            v.parse(GetSpotFeeRatesInputSchema, {
                symbolIds: [101, 202, 101],
            }),
        ).toEqual({
            symbolId: [101, 202],
        });
    });

    it("rejects more than 100 symbol identifiers", () => {
        expect(() =>
            v.parse(GetSpotFeeRatesInputSchema, {
                symbolIds: Array.from({ length: 101 }, (_, index) => index + 1),
            }),
        ).toThrow();
    });
});

describe("SpotFeeRateSchema", () => {
    it("parses an effective spot fee row", () => {
        expect(
            v.parse(SpotFeeRateSchema, {
                symbolId: 101,
                symbol: " BTC-USDT ",
                makerFeeRatePercent: "-0.01",
                takerFeeRatePercent: "0.05",
                vipTier: 0,
            }),
        ).toEqual({
            symbolId: 101,
            symbol: "BTC-USDT",
            makerFeeRatePercent: "-0.01",
            takerFeeRatePercent: "0.05",
            vipTier: 0,
        });
    });
});
