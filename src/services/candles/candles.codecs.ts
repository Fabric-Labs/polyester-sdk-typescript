import * as Proto from "../../gen/marketdata/v1/marketdata_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const TIMEFRAMES = [
    "1s",
    "1m",
    "5m",
    "15m",
    "30m",
    "1h",
    "4h",
    "12h",
    "1d",
    "1w",
    "1mo",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export const TimeframeCodec = {
    inputToProto: {
        "1s": Proto.Timeframe.SEC_1,
        "1m": Proto.Timeframe.MIN_1,
        "5m": Proto.Timeframe.MIN_5,
        "15m": Proto.Timeframe.MIN_15,
        "30m": Proto.Timeframe.MIN_30,
        "1h": Proto.Timeframe.HOUR_1,
        "4h": Proto.Timeframe.HOUR_4,
        "12h": Proto.Timeframe.HOUR_12,
        "1d": Proto.Timeframe.DAY_1,
        "1w": Proto.Timeframe.WEEK_1,
        "1mo": Proto.Timeframe.MONTH_1,
    } satisfies InputToProto<Timeframe, Proto.Timeframe>,
    protoToOutput: {
        [Proto.Timeframe.TIMEFRAME_UNSPECIFIED]: "unspecified",
        [Proto.Timeframe.SEC_1]: "1s",
        [Proto.Timeframe.MIN_1]: "1m",
        [Proto.Timeframe.MIN_5]: "5m",
        [Proto.Timeframe.MIN_15]: "15m",
        [Proto.Timeframe.MIN_30]: "30m",
        [Proto.Timeframe.HOUR_1]: "1h",
        [Proto.Timeframe.HOUR_4]: "4h",
        [Proto.Timeframe.HOUR_12]: "12h",
        [Proto.Timeframe.DAY_1]: "1d",
        [Proto.Timeframe.WEEK_1]: "1w",
        [Proto.Timeframe.MONTH_1]: "1mo",
    } satisfies ProtoToOutput<Proto.Timeframe, Timeframe>,
} as const;
