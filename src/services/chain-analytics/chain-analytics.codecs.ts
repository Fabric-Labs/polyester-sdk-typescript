import * as Proto from "../../gen/chain/analytics/v1/analytics_read_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const CHAIN_ANALYTICS_RANGE_VALUES = ["1d", "7d", "30d", "90d", "180d", "365d"] as const;
export type ChainAnalyticsRangeValue = (typeof CHAIN_ANALYTICS_RANGE_VALUES)[number];

export const ChainAnalyticsRangeCodec = {
    inputToProto: {
        "1d": Proto.ChainAnalyticsRange.DAY_1,
        "7d": Proto.ChainAnalyticsRange.DAY_7,
        "30d": Proto.ChainAnalyticsRange.DAY_30,
        "90d": Proto.ChainAnalyticsRange.DAY_90,
        "180d": Proto.ChainAnalyticsRange.DAY_180,
        "365d": Proto.ChainAnalyticsRange.DAY_365,
    } satisfies InputToProto<ChainAnalyticsRangeValue, Proto.ChainAnalyticsRange>,
    protoToOutput: {
        [Proto.ChainAnalyticsRange.RANGE_UNSPECIFIED]: "unspecified",
        [Proto.ChainAnalyticsRange.DAY_1]: "1d",
        [Proto.ChainAnalyticsRange.DAY_7]: "7d",
        [Proto.ChainAnalyticsRange.DAY_30]: "30d",
        [Proto.ChainAnalyticsRange.DAY_90]: "90d",
        [Proto.ChainAnalyticsRange.DAY_180]: "180d",
        [Proto.ChainAnalyticsRange.DAY_365]: "365d",
    } satisfies ProtoToOutput<Proto.ChainAnalyticsRange, ChainAnalyticsRangeValue>,
} as const;
