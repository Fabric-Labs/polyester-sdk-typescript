import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { formatId } from "../../utils/base58-id.js";
import { GetSpotFeeRatesInputSchema, SpotFeeRateSchema } from "./fees.schemas.js";

describe("GetSpotFeeRatesInputSchema", () => {
    it("maps account scope and symbol filters onto the proto request", () => {
        expect(
            v.parse(GetSpotFeeRatesInputSchema, {
                account: { subaccountId: formatId(42n) },
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

    it("enforces the positive uint32 symbol identifier boundary", () => {
        expect(
            v.parse(GetSpotFeeRatesInputSchema, { symbolIds: [PROTOBUF_UINT32_MAX] }).symbolId,
        ).toEqual([PROTOBUF_UINT32_MAX]);
        expect(() =>
            v.parse(GetSpotFeeRatesInputSchema, { symbolIds: [PROTOBUF_UINT32_MAX + 1] }),
        ).toThrow();
    });
});

describe("SpotFeeRateSchema", () => {
    const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });
    const discount = {
        makerDiscountPercent: "10",
        takerDiscountPercent: "10",
        allMarkets: false,
        effectiveFrom: ts(1_700_000_000),
    };
    const row = {
        symbolId: 101,
        makerFeeRatePercent: "-0.01",
        takerFeeRatePercent: "0.072",
        vipTier: 0,
        reserveFeeRatePercent: "0.1",
        postOnlyReserveFeeRatePercent: "0.02",
        breakdown: {
            tierMakerFeeRatePercent: "-0.01",
            tierTakerFeeRatePercent: "0.1",
            marketMultiplier: {
                makerMultiplierPercent: "100",
                takerMultiplierPercent: "100",
                effectiveFrom: ts(1_700_000_000),
                effectiveTo: ts(1_800_000_000),
            },
            accountDiscounts: [discount],
            referralDiscount: { ...discount, takerDiscountPercent: "20", allMarkets: true },
        },
        nextChangeAt: ts(1_800_000_000),
    };

    it("parses reserve rates, the rate breakdown and timestamps as Unix ms", () => {
        expect(v.parse(SpotFeeRateSchema, row)).toEqual({
            ...row,
            breakdown: {
                ...row.breakdown,
                marketMultiplier: {
                    makerMultiplierPercent: "100",
                    takerMultiplierPercent: "100",
                    effectiveFrom: 1_700_000_000_000,
                    effectiveTo: 1_800_000_000_000,
                },
                accountDiscounts: [
                    { ...discount, effectiveFrom: 1_700_000_000_000, effectiveTo: undefined },
                ],
                referralDiscount: {
                    ...discount,
                    takerDiscountPercent: "20",
                    allMarkets: true,
                    effectiveFrom: 1_700_000_000_000,
                    effectiveTo: undefined,
                },
            },
            nextChangeAt: 1_800_000_000_000,
        });
    });

    it("rejects a row without reserve rates or a breakdown", () => {
        expect(() => v.parse(SpotFeeRateSchema, { ...row, reserveFeeRatePercent: "" })).toThrow();
        expect(() => v.parse(SpotFeeRateSchema, { ...row, breakdown: undefined })).toThrow();
    });
});
