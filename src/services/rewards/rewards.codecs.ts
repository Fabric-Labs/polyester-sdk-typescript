import * as Proto from "../../gen/rewards/v1/rewards_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const REWARD_FULFILLMENT_METHOD_VALUES = [
    "unspecified",
    "external_testnet",
    "internal_trading",
] as const;
export type RewardFulfillmentMethod = (typeof REWARD_FULFILLMENT_METHOD_VALUES)[number];

export const REWARD_FULFILLMENT_STATE_VALUES = [
    "unspecified",
    "awaiting_destination",
    "ready_for_payout",
    "paid",
    "failed",
    "canceled",
] as const;
export type RewardFulfillmentState = (typeof REWARD_FULFILLMENT_STATE_VALUES)[number];

export const RewardFulfillmentMethodCodec = {
    protoToOutput: {
        [Proto.RewardFulfillmentMethod.METHOD_UNSPECIFIED]: "unspecified",
        [Proto.RewardFulfillmentMethod.EXTERNAL_TESTNET]: "external_testnet",
        [Proto.RewardFulfillmentMethod.INTERNAL_TRADING]: "internal_trading",
    } satisfies ProtoToOutput<Proto.RewardFulfillmentMethod, RewardFulfillmentMethod>,
} as const;

export const RewardFulfillmentStateCodec = {
    protoToOutput: {
        [Proto.RewardFulfillmentState.STATE_UNSPECIFIED]: "unspecified",
        [Proto.RewardFulfillmentState.AWAITING_DESTINATION]: "awaiting_destination",
        [Proto.RewardFulfillmentState.READY_FOR_PAYOUT]: "ready_for_payout",
        [Proto.RewardFulfillmentState.PAID]: "paid",
        [Proto.RewardFulfillmentState.FAILED]: "failed",
        [Proto.RewardFulfillmentState.CANCELED]: "canceled",
    } satisfies ProtoToOutput<Proto.RewardFulfillmentState, RewardFulfillmentState>,
} as const;
