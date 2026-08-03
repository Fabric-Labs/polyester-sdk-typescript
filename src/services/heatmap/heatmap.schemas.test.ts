import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/marketdata/v1/heatmap_pb.js";
import { GetOrderbookHeatmapInputSchema } from "./heatmap.schemas.js";

describe("GetOrderbookHeatmapInputSchema", () => {
    it("maps explicit input values to proto values", () => {
        const input = v.parse(GetOrderbookHeatmapInputSchema, {
            symbolId: 1,
            interval: "1m",
            depth: 50,
            quantityMode: "peak",
            limit: 100,
            startTsSec: 1_767_225_600,
            endTsSec: 1_767_225_900,
        });

        expect(input.interval).toBe(Proto.HeatmapInterval.INTERVAL_1M);
        expect(input.depth).toBe(Proto.HeatmapDepth.DEPTH_50);
        expect(input.quantityMode).toBe(Proto.HeatmapQuantityMode.PEAK);
        expect(input.pageToken).toBe("");
        expect(input.timeRange).toEqual({
            startTime: { seconds: 1_767_225_600n, nanos: 0 },
            endTime: { seconds: 1_767_225_900n, nanos: 0 },
        });
    });

    it("uses explicit defaults for omitted optional codec inputs", () => {
        const input = v.parse(GetOrderbookHeatmapInputSchema, {
            symbolId: 1,
            startTsSec: 100,
        });

        expect(input.interval).toBe(Proto.HeatmapInterval.INTERVAL_1S);
        expect(input.depth).toBe(Proto.HeatmapDepth.DEPTH_50);
        expect(input.quantityMode).toBe(Proto.HeatmapQuantityMode.CLOSE);
        expect(input.pageToken).toBe("");
        expect(input.timeRange).toEqual({
            startTime: { seconds: 100n, nanos: 0 },
            endTime: undefined,
        });
    });

    it("accepts page-token pagination without a time range", () => {
        const input = v.parse(GetOrderbookHeatmapInputSchema, {
            symbolId: 1,
            pageToken: "cursor-1",
        });

        expect(input.pageToken).toBe("cursor-1");
        expect(input.timeRange).toBeUndefined();
    });

    it("rejects proto enum inputs, timestamp coercion, and missing ranges", () => {
        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                interval: Proto.HeatmapInterval.INTERVAL_1M,
                startTsSec: 100,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                depth: Proto.HeatmapDepth.DEPTH_100,
                startTsSec: 100,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                quantityMode: Proto.HeatmapQuantityMode.PEAK,
                startTsSec: 100,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                startTsSec: "1767225600",
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
            }),
        ).toThrow();
    });
});
