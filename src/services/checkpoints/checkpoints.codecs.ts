import * as Proto from "../../gen/checkpoints/v1/checkpoints_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const CHECKPOINT_BADGE_VALUES = [
    "unspecified",
    "first_trade",
    "seven_day_streak",
    "three_markets",
    "volume_1000_usd",
    "hundred_trades",
    "ten_markets",
    "thirty_day_streak",
    "every_order_tool",
] as const;
export type CheckpointBadge = (typeof CHECKPOINT_BADGE_VALUES)[number];

export const CHECKPOINT_FIELD_VALUES = [
    "unspecified",
    "volume",
    "top_pairs",
    "order_types",
    "time_in_force",
    "order_status",
    "tools",
    "median_limit_rest",
    "deposits",
    "withdrawals",
    "internal_transfers",
    "daily_claim_amounts",
    "portfolio_value",
    "trading_balances",
    "funding_balances",
    "transfers",
    "season_result",
] as const;
export type CheckpointField = (typeof CHECKPOINT_FIELD_VALUES)[number];

export const CheckpointBadgeCodec = {
    protoToOutput: {
        [Proto.CheckpointBadge.BADGE_UNSPECIFIED]: "unspecified",
        [Proto.CheckpointBadge.FIRST_TRADE]: "first_trade",
        [Proto.CheckpointBadge.SEVEN_DAY_STREAK]: "seven_day_streak",
        [Proto.CheckpointBadge.THREE_MARKETS]: "three_markets",
        [Proto.CheckpointBadge.VOLUME_1000_USD]: "volume_1000_usd",
        [Proto.CheckpointBadge.HUNDRED_TRADES]: "hundred_trades",
        [Proto.CheckpointBadge.TEN_MARKETS]: "ten_markets",
        [Proto.CheckpointBadge.THIRTY_DAY_STREAK]: "thirty_day_streak",
        [Proto.CheckpointBadge.EVERY_ORDER_TOOL]: "every_order_tool",
    } satisfies ProtoToOutput<Proto.CheckpointBadge, CheckpointBadge>,
} as const;

export const CheckpointFieldCodec = {
    protoToOutput: {
        [Proto.CheckpointField.FIELD_UNSPECIFIED]: "unspecified",
        [Proto.CheckpointField.VOLUME]: "volume",
        [Proto.CheckpointField.TOP_PAIRS]: "top_pairs",
        [Proto.CheckpointField.ORDER_TYPES]: "order_types",
        [Proto.CheckpointField.TIME_IN_FORCE]: "time_in_force",
        [Proto.CheckpointField.ORDER_STATUS]: "order_status",
        [Proto.CheckpointField.TOOLS]: "tools",
        [Proto.CheckpointField.MEDIAN_LIMIT_REST]: "median_limit_rest",
        [Proto.CheckpointField.DEPOSITS]: "deposits",
        [Proto.CheckpointField.WITHDRAWALS]: "withdrawals",
        [Proto.CheckpointField.INTERNAL_TRANSFERS]: "internal_transfers",
        [Proto.CheckpointField.DAILY_CLAIM_AMOUNTS]: "daily_claim_amounts",
        [Proto.CheckpointField.PORTFOLIO_VALUE]: "portfolio_value",
        [Proto.CheckpointField.TRADING_BALANCES]: "trading_balances",
        [Proto.CheckpointField.FUNDING_BALANCES]: "funding_balances",
        [Proto.CheckpointField.TRANSFERS]: "transfers",
        [Proto.CheckpointField.SEASON_RESULT]: "season_result",
    } satisfies ProtoToOutput<Proto.CheckpointField, CheckpointField>,
} as const;
