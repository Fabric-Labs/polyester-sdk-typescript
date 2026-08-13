import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const TRADING_RATE_LIMIT_CLASS_VALUES = ["place", "cancel"] as const;
export type TradingRateLimitClassName = (typeof TRADING_RATE_LIMIT_CLASS_VALUES)[number];

export const TradingRateLimitClassCodec = {
    protoToOutput: {
        [Proto.TradingRateLimitClass.UNSPECIFIED]: "unspecified",
        [Proto.TradingRateLimitClass.PLACE]: "place",
        [Proto.TradingRateLimitClass.CANCEL]: "cancel",
    } satisfies ProtoToOutput<Proto.TradingRateLimitClass, TradingRateLimitClassName>,
} as const;
