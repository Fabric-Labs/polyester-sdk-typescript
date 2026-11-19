import { DepthTier } from "../gen/polyester/type/v1/depth_tier_pb.js";
import type { InputToProto, ProtoToOutput } from "../utils/types.js";

/** Price levels per side that `polyester.type.v1.DepthTier` can express. */
export const DEPTH_TIER_VALUES = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000] as const;
export type DepthTierValue = (typeof DEPTH_TIER_VALUES)[number];

export const DepthTierCodec = {
    inputToProto: {
        1: DepthTier.DEPTH_1,
        5: DepthTier.DEPTH_5,
        10: DepthTier.DEPTH_10,
        20: DepthTier.DEPTH_20,
        50: DepthTier.DEPTH_50,
        100: DepthTier.DEPTH_100,
        200: DepthTier.DEPTH_200,
        500: DepthTier.DEPTH_500,
        1000: DepthTier.DEPTH_1000,
        5000: DepthTier.DEPTH_5000,
    } satisfies InputToProto<DepthTierValue, DepthTier>,
    protoToOutput: {
        [DepthTier.DEPTH_UNSPECIFIED]: "unspecified",
        [DepthTier.DEPTH_1]: 1,
        [DepthTier.DEPTH_5]: 5,
        [DepthTier.DEPTH_10]: 10,
        [DepthTier.DEPTH_20]: 20,
        [DepthTier.DEPTH_50]: 50,
        [DepthTier.DEPTH_100]: 100,
        [DepthTier.DEPTH_200]: 200,
        [DepthTier.DEPTH_500]: 500,
        [DepthTier.DEPTH_1000]: 1000,
        [DepthTier.DEPTH_5000]: 5000,
    } satisfies ProtoToOutput<DepthTier, DepthTierValue>,
} as const;
