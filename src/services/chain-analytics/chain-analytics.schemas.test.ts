import * as Proto from "../../gen/chain/analytics/v1/analytics_read_pb.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
    GetUnifiedAssetBalancesInputSchema,
    GetZippedAssetSupplyGroupInputSchema,
    GetZippedAssetSupplyInputSchema,
    createUnifiedAssetBalancesResponseSchema,
    createZippedAssetSupplyGroupResponseSchema,
    createZippedAssetSupplyResponseSchema,
} from "./chain-analytics.schemas.js";

const testScales = {
    ready: async () => {},
    price: () => 6,
    baseQty: () => 6,
    quoteAmount: () => 6,
    ledgerAmount: () => 6,
    zippedAssetAmount: () => 6,
} satisfies SdkScales;

describe("chain analytics schemas", () => {
    it("maps inputs to proto enum ranges and trims optional fields", () => {
        expect(
            v.parse(GetZippedAssetSupplyInputSchema, {
                zippedAssetId: 100,
                range: "7d",
                bucket: " 1h ",
                startTsSec: 100,
                endTsSec: 200,
            }),
        ).toEqual({
            zippedAssetId: 100,
            range: Proto.ChainAnalyticsRange.DAY_7,
            bucket: "1h",
            startTsSec: 100,
            endTsSec: 200,
        });
        expect(v.parse(GetZippedAssetSupplyGroupInputSchema, { groupId: " group " })).toEqual({
            groupId: "group",
            range: Proto.ChainAnalyticsRange.DAY_1,
            bucket: "",
            startTsSec: undefined,
            endTsSec: undefined,
        });
        expect(() =>
            v.parse(GetUnifiedAssetBalancesInputSchema, { assetId: 0, extra: true }),
        ).toThrow();
    });

    it("converts zipped asset supply output to decimal strings", async () => {
        const output = v.parse(createZippedAssetSupplyResponseSchema(testScales), {
            zippedAssetId: 100,
            range: Proto.ChainAnalyticsRange.DAY_30,
            bucket: "1d",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            totalSupplyQ: [1_500_000n, 2_000_000n],
        });

        expect(output).toEqual({
            zippedAssetId: 100,
            range: "30d",
            bucket: "1d",
            startTsSec: 100,
            endTsSec: 200,
            points: 2,
            totalSupply: ["1.5", "2"],
        });
    });

    it("converts grouped supply and unified balances", async () => {
        expect(
            v.parse(createZippedAssetSupplyGroupResponseSchema(testScales), {
                groupId: "usdc",
                range: Proto.ChainAnalyticsRange.DAY_1,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                points: 1,
                series: [{ zippedAssetId: 100, totalSupplyQ: [123_456n] }],
            }),
        ).toMatchObject({
            groupId: "usdc",
            series: [{ zippedAssetId: 100, totalSupply: ["0.123456"] }],
        });

        expect(
            v.parse(createUnifiedAssetBalancesResponseSchema(testScales), {
                assetId: 1,
                range: Proto.ChainAnalyticsRange.DAY_365,
                bucket: "1d",
                startTsSec: 100,
                endTsSec: 200,
                points: 1,
                totalBalanceQ: [10_000_000n],
            }),
        ).toMatchObject({
            assetId: 1,
            range: "365d",
            totalBalance: ["10"],
        });
    });

    it("preserves proto-zero output ranges as unspecified", async () => {
        expect(
            v.parse(createUnifiedAssetBalancesResponseSchema(testScales), {
                assetId: 1,
                range: Proto.ChainAnalyticsRange.RANGE_UNSPECIFIED,
                bucket: "1d",
                startTsSec: 100,
                endTsSec: 200,
                points: 1,
                totalBalanceQ: [1n],
            }),
        ).toMatchObject({ range: "unspecified" });
    });

    it("rejects invalid point metadata and mismatched columns", async () => {
        expect(() =>
            v.parse(createZippedAssetSupplyResponseSchema(testScales), {
                zippedAssetId: 100,
                range: Proto.ChainAnalyticsRange.DAY_1,
                bucket: "1h",
                startTsSec: 200,
                endTsSec: 100,
                points: 1,
                totalSupplyQ: [1n],
            }),
        ).toThrow("endTsSec");

        expect(() =>
            v.parse(createZippedAssetSupplyResponseSchema(testScales), {
                zippedAssetId: 100,
                range: Proto.ChainAnalyticsRange.DAY_1,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                points: -1,
                totalSupplyQ: [],
            }),
        ).toThrow();

        expect(() =>
            v.parse(createZippedAssetSupplyGroupResponseSchema(testScales), {
                groupId: "usdc",
                range: Proto.ChainAnalyticsRange.DAY_1,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                points: 2,
                series: [{ zippedAssetId: 100, totalSupplyQ: [1n] }],
            }),
        ).toThrow("points");
    });
});
