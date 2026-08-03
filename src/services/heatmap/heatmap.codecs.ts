import {
    HeatmapDepth,
    HeatmapInterval,
    HeatmapQuantityMode,
} from "../../gen/marketdata/v1/heatmap_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const HEATMAP_INTERVAL_VALUES = ["1s", "1m", "5m", "1h"] as const;
export type HeatmapIntervalValue = (typeof HEATMAP_INTERVAL_VALUES)[number];

export const HEATMAP_DEPTH_VALUES = [1, 5, 10, 20, 50, 100, 200, 500, 1000] as const;
export type HeatmapDepthValue = (typeof HEATMAP_DEPTH_VALUES)[number];

export const HEATMAP_QUANTITY_MODE_VALUES = ["close", "peak"] as const;
export type HeatmapQuantityModeValue = (typeof HEATMAP_QUANTITY_MODE_VALUES)[number];

export const HeatmapIntervalCodec = {
    inputToProto: {
        "1s": HeatmapInterval.INTERVAL_1S,
        "1m": HeatmapInterval.INTERVAL_1M,
        "5m": HeatmapInterval.INTERVAL_5M,
        "1h": HeatmapInterval.INTERVAL_1H,
    } satisfies InputToProto<HeatmapIntervalValue, HeatmapInterval>,
    protoToOutput: {
        [HeatmapInterval.INTERVAL_UNSPECIFIED]: "unspecified",
        [HeatmapInterval.INTERVAL_1S]: "1s",
        [HeatmapInterval.INTERVAL_1M]: "1m",
        [HeatmapInterval.INTERVAL_5M]: "5m",
        [HeatmapInterval.INTERVAL_1H]: "1h",
    } satisfies ProtoToOutput<HeatmapInterval, HeatmapIntervalValue>,
} as const;

export const HeatmapDepthCodec = {
    inputToProto: {
        1: HeatmapDepth.DEPTH_1,
        5: HeatmapDepth.DEPTH_5,
        10: HeatmapDepth.DEPTH_10,
        20: HeatmapDepth.DEPTH_20,
        50: HeatmapDepth.DEPTH_50,
        100: HeatmapDepth.DEPTH_100,
        200: HeatmapDepth.DEPTH_200,
        500: HeatmapDepth.DEPTH_500,
        1000: HeatmapDepth.DEPTH_1000,
    } satisfies InputToProto<HeatmapDepthValue, HeatmapDepth>,
    protoToOutput: {
        [HeatmapDepth.DEPTH_UNSPECIFIED]: "unspecified",
        [HeatmapDepth.DEPTH_1]: 1,
        [HeatmapDepth.DEPTH_5]: 5,
        [HeatmapDepth.DEPTH_10]: 10,
        [HeatmapDepth.DEPTH_20]: 20,
        [HeatmapDepth.DEPTH_50]: 50,
        [HeatmapDepth.DEPTH_100]: 100,
        [HeatmapDepth.DEPTH_200]: 200,
        [HeatmapDepth.DEPTH_500]: 500,
        [HeatmapDepth.DEPTH_1000]: 1000,
    } satisfies ProtoToOutput<HeatmapDepth, HeatmapDepthValue>,
    supportedDepths: HEATMAP_DEPTH_VALUES,
} as const;

export const HeatmapQuantityModeCodec = {
    inputToProto: {
        close: HeatmapQuantityMode.CLOSE,
        peak: HeatmapQuantityMode.PEAK,
    } satisfies InputToProto<HeatmapQuantityModeValue, HeatmapQuantityMode>,
    protoToOutput: {
        [HeatmapQuantityMode.QTY_MODE_UNSPECIFIED]: "unspecified",
        [HeatmapQuantityMode.CLOSE]: "close",
        [HeatmapQuantityMode.PEAK]: "peak",
    } satisfies ProtoToOutput<HeatmapQuantityMode, HeatmapQuantityModeValue>,
} as const;
