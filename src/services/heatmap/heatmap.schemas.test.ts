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
        expect(input.mode).toEqual({
            case: "timeRange",
            startTime: { seconds: 1_767_225_600n, nanos: 0 },
            endTime: { seconds: 1_767_225_900n, nanos: 0 },
        });
    });

    it("uses explicit defaults for omitted optional codec inputs", () => {
        const input = v.parse(GetOrderbookHeatmapInputSchema, {
            symbolId: 1,
            cursorTsSec: 100,
        });

        expect(input.interval).toBe(Proto.HeatmapInterval.INTERVAL_1S);
        expect(input.depth).toBe(Proto.HeatmapDepth.DEPTH_50);
        expect(input.quantityMode).toBe(Proto.HeatmapQuantityMode.CLOSE);
        expect(input.mode).toEqual({ case: "cursor", fromTsSec: 100n });
    });

    it("rejects proto enum inputs, timestamp coercion, and missing ranges", () => {
        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                interval: Proto.HeatmapInterval.INTERVAL_1M,
                cursorTsSec: 100,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                depth: Proto.HeatmapDepth.DEPTH_100,
                cursorTsSec: 100,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                quantityMode: Proto.HeatmapQuantityMode.PEAK,
                cursorTsSec: 100,
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
                cursorTsSec: "100",
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                cursorTsSec: 100n,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
                cursorTsSec: 0,
            }),
        ).toThrow();

        expect(() =>
            v.parse(GetOrderbookHeatmapInputSchema, {
                symbolId: 1,
            }),
        ).toThrow();
    });
});
