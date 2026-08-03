import * as Proto from "../../gen/chain/analytics/v1/analytics_read_pb.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import { unaryTransportByMethod } from "../../testing/service-harness.js";
import { describe, expect, it } from "vitest";
import { ChainAnalyticsService } from "./chain-analytics.js";

const testScales = {
    ready: async () => {},
    price: () => 6,
    baseQty: () => 6,
    quoteAmount: () => 6,
    ledgerAmount: () => 6,
    zippedAssetAmount: () => 6,
} satisfies SdkScales;

describe("ChainAnalyticsService", () => {
    it("calls analytics RPCs and parses scaled series", async () => {
        const transport = unaryTransportByMethod({
            getZippedAssetSupply: {
                zippedAssetId: 100,
                range: Proto.ChainAnalyticsRange.DAY_7,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                points: 2,
                totalSupplyQ: [1_000_000n, 2_000_000n],
            },
            getZippedAssetSupplyGroup: {
                groupId: "usdc",
                range: Proto.ChainAnalyticsRange.DAY_1,
                bucket: "1h",
                startTsSec: 100,
                endTsSec: 200,
                points: 1,
                series: [{ zippedAssetId: 100, totalSupplyQ: [500_000n] }],
            },
            getUnifiedAssetBalances: {
                assetId: 1,
                range: Proto.ChainAnalyticsRange.DAY_30,
                bucket: "1d",
                startTsSec: 100,
                endTsSec: 200,
                points: 1,
                totalBalanceQ: [3_000_000n],
            },
        });
        const service = new ChainAnalyticsService(transport.transport, testScales);
        const signal = new AbortController().signal;

        await expect(
            service.getZippedAssetSupply({ zippedAssetId: 100, range: "7d" }, { signal }),
        ).resolves.toMatchObject({ range: "7d", totalSupply: ["1", "2"] });
        await expect(
            service.getZippedAssetSupplyGroup({ groupId: " usdc " }),
        ).resolves.toMatchObject({
            groupId: "usdc",
            series: [{ zippedAssetId: 100, totalSupply: ["0.5"] }],
        });
        await expect(
            service.getUnifiedAssetBalances({ assetId: 1, range: "30d" }),
        ).resolves.toMatchObject({
            assetId: 1,
            totalBalance: ["3"],
        });

        expect(transport.calls[0]?.message).toMatchObject({
            zippedAssetId: 100,
            range: Proto.ChainAnalyticsRange.DAY_7,
        });
        expect(transport.calls[0]?.signal).toBe(signal);
        expect(transport.calls[1]?.message).toMatchObject({
            groupId: "usdc",
            range: Proto.ChainAnalyticsRange.DAY_1,
        });
        expect(transport.calls[2]?.message).toMatchObject({
            assetId: 1,
            range: Proto.ChainAnalyticsRange.DAY_30,
        });
    });
});
