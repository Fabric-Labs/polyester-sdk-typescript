import { HeatmapInterval, HeatmapQuantityMode } from "../../gen/marketdata/v1/heatmap_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const HEATMAP_INTERVAL_VALUES = ["1s", "1m", "5m", "1h"] as const;
export type HeatmapIntervalValue = (typeof HEATMAP_INTERVAL_VALUES)[number];

/** Every `DepthTier` except 5000, which the heatmap refuses. */
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
