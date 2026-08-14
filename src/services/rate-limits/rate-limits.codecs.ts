import * as Proto from "../../gen/ratelimit/v1/ratelimit_pb.js";
import type { RateLimitPolicyClass } from "../../shared/rate-limit.schemas.js";
import type { ProtoToOutput } from "../../utils/types.js";

export type TradingRateLimitClass = Extract<
    RateLimitPolicyClass,
    "unspecified" | "trading_place" | "trading_cancel"
>;

export const TradingRateLimitClassCodec = {
    protoToOutput: {
        [Proto.TradingRateLimitClass.UNSPECIFIED]: "unspecified",
        [Proto.TradingRateLimitClass.PLACE]: "trading_place",
        [Proto.TradingRateLimitClass.CANCEL]: "trading_cancel",
    } satisfies ProtoToOutput<Proto.TradingRateLimitClass, TradingRateLimitClass>,
} as const;
