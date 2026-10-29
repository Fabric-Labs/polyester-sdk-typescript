import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";
export {
    FEE_ASSET_VALUES,
    FeeAssetCodec,
    type FeeAssetValue,
    ORDER_SIDE_VALUES as TRIGGER_SIDE_VALUES,
    ORDER_TYPE_VALUES,
    OrderSideCodec as TriggerSideCodec,
    type OrderSideValue as TriggerSideValue,
    OrderTypeCodec,
    type OrderTypeValue,
    SELF_TRADE_PREVENTION_MODE_VALUES,
    SelfTradePreventionModeCodec,
    type SelfTradePreventionModeValue,
    TIME_IN_FORCE_OUTPUT_VALUES,
    TIME_IN_FORCE_VALUES,
    TimeInForceCodec,
    type TimeInForceOutputValue,
    type TimeInForceValue,
    TRIGGER_PRICE_SOURCE_VALUES,
    TriggerPriceSourceCodec,
    type TriggerPriceSourceValue,
} from "../orders/order-enums.codecs.js";

export const TRIGGER_TYPE_VALUES = [
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
] as const;
export type TriggerTypeValue = (typeof TRIGGER_TYPE_VALUES)[number];

export const TRIGGER_TYPE_LABEL_VALUES = TRIGGER_TYPE_VALUES;
export type TriggerTypeLabelValue = (typeof TRIGGER_TYPE_LABEL_VALUES)[number];

export const TRIGGER_STATUS_FILTER_VALUES = [
    "created",
    "armed",
    "running",
    "completed",
    "cancelled",
    "failed",
    "paused",
] as const;
export type TriggerStatusFilterValue = (typeof TRIGGER_STATUS_FILTER_VALUES)[number];

export const TRIGGER_STATUS_LABEL_VALUES = TRIGGER_STATUS_FILTER_VALUES;
export type TriggerStatusLabelValue = (typeof TRIGGER_STATUS_LABEL_VALUES)[number];

export const TRIGGER_EVENT_TYPE_VALUES = [
    "fired",
    "canceled",
    "updated",
    "failed",
    "activated",
] as const;
export type TriggerEventTypeValue = (typeof TRIGGER_EVENT_TYPE_VALUES)[number];

export const TRIGGER_EVENT_TYPE_LABEL_VALUES = TRIGGER_EVENT_TYPE_VALUES;
export type TriggerEventTypeLabelValue = (typeof TRIGGER_EVENT_TYPE_LABEL_VALUES)[number];

export const TRIGGER_CANCEL_REASON_LABEL_VALUES = [
    "user_request",
    "oco",
    "parent_canceled_no_fill",
    "self_trade_prevention",
    "account_repair",
    "pair_drain_trigger",
    "pair_drain_twap",
    "pair_drain_ladder",
    "pair_drain_attached_leg",
    "missing_reason_code",
    "internal_error",
] as const;
export type TriggerCancelReasonLabelValue = (typeof TRIGGER_CANCEL_REASON_LABEL_VALUES)[number];

export const TRIGGER_FAILURE_REASON_LABEL_VALUES = [
    "unknown_symbol",
    "pair_disabled",
    "min_notional",
    "tick_size",
    "insufficient_funds",
    "risk_limit",
    "duplicate_client_id",
    "market_halted",
    "engine_busy",
    "account_unknown",
    "order_unknown",
    "post_only_cross",
    "reduce_only_blocked",
    "price_band_violation",
    "market_cap_violation",
    "empty_book",
    "fok_insufficient_liquidity",
    "fee_asset_not_allowed",
    "market_price_unavailable",
    "stale_quote",
    "min_quantity",
    "step_size",
    "invalid_sizing",
    "max_quote_debit_too_small",
    "fee_ceiling_exceeded",
    "trigger_price_invalid",
    "trigger_price_source_unsupported",
    "trailing_distance_invalid",
    "modification_requires_replace",
    "order_already_terminal",
    "conflict_idempotency_key_reuse",
    "rate_limited",
    "policy_spot_trade_deny",
    "policy_market_deny",
    "policy_max_notional",
    "policy_max_open_orders",
    "policy_trading_halted",
    "max_slippage_invalid",
    "invalid_time_in_force",
    "duplicate_order_id",
    "max_quantity",
    "max_notional",
    "pair_post_only",
    "max_open_orders_total",
    "stp_mode_not_allowed",
    "pair_backlogged",
    "mode_not_supported",
    "market_quote_stale",
    "market_quote_unhealthy",
    "qty_invalid",
    "limit_price_invalid",
    "twap_interval_invalid",
    "ladder_range_too_narrow",
    "ladder_levels_invalid",
    "attached_legs_exceeded",
    "price_levels_exhausted",
    "settlement_backlogged",
    "client_order_ids_exhausted",
    "invalid_order_id",
    "order_id_conflict",
    "invalid_side",
    "invalid_order_type",
    "invalid_stp_mode",
    "invalid_order_flags",
    "price_level_quantity_limit",
    "child_qty_raise_not_allowed",
    "triggers_exhausted",
    "order_sequence_exhausted",
    "fee_schedule_unavailable",
    "policy_unavailable",
    "account_routing_invalid",
    "client_trigger_id_invalid",
    "trigger_direction_invalid",
    "fee_asset_invalid",
    "fee_ceiling_invalid",
    "unsupported_field_set",
    "trigger_fire_limit_reached",
    "condition_flags_invalid",
    "condition_parameter_set",
    "slippage_ticks_invalid",
    "slippage_bps_invalid",
    "slippage_bounds_conflict",
    "limit_child_slippage_set",
    "new_account_capacity_reached",
    "order_type_not_allowed_in_auction",
    "post_only_not_allowed_in_auction",
    "twap_capacity_reached",
    "order_limits_unavailable",
    "child_order_inconsistent",
    "index_price_unavailable",
    "trigger_would_trigger_immediately",
    "missing_reason_code",
    "internal_error",
] as const;
export type TriggerFailureReasonLabelValue = (typeof TRIGGER_FAILURE_REASON_LABEL_VALUES)[number];

export const TRIGGER_DIRECTION_VALUES = ["above", "below"] as const;
export type TriggerDirectionValue = (typeof TRIGGER_DIRECTION_VALUES)[number];

export const LADDER_DISTRIBUTION_VALUES = ["linear"] as const;
export type LadderDistributionValue = (typeof LADDER_DISTRIBUTION_VALUES)[number];

export const LADDER_DISTRIBUTION_LABEL_VALUES = [
    "linear",
    "geometric",
    "weighted_favorable",
] as const;
export type LadderDistributionLabelValue = (typeof LADDER_DISTRIBUTION_LABEL_VALUES)[number];

export const TriggerTypeCodec = {
    inputToProto: {
        stop_loss: Proto.TriggerType.STOP_LOSS,
        take_profit: Proto.TriggerType.TAKE_PROFIT,
        trailing_stop: Proto.TriggerType.TRAILING_STOP,
        twap: Proto.TriggerType.TWAP,
        ladder: Proto.TriggerType.LADDER,
    } satisfies InputToProto<TriggerTypeValue, Proto.TriggerType>,
    protoToOutput: {
        [Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED]: "unspecified",
        [Proto.TriggerType.STOP_LOSS]: "stop_loss",
        [Proto.TriggerType.TAKE_PROFIT]: "take_profit",
        [Proto.TriggerType.TRAILING_STOP]: "trailing_stop",
        [Proto.TriggerType.TWAP]: "twap",
        [Proto.TriggerType.LADDER]: "ladder",
    } satisfies ProtoToOutput<Proto.TriggerType, TriggerTypeLabelValue>,
} as const;

export const TriggerStatusCodec = {
    inputToProto: {
        created: Proto.TriggerStatus.STATUS_CREATED,
        armed: Proto.TriggerStatus.STATUS_ARMED,
        running: Proto.TriggerStatus.STATUS_RUNNING,
        completed: Proto.TriggerStatus.STATUS_COMPLETED,
        cancelled: Proto.TriggerStatus.STATUS_CANCELED,
        failed: Proto.TriggerStatus.STATUS_FAILED,
        paused: Proto.TriggerStatus.STATUS_PAUSED,
    } satisfies InputToProto<TriggerStatusFilterValue, Proto.TriggerStatus>,
    protoToOutput: {
        [Proto.TriggerStatus.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.TriggerStatus.STATUS_CREATED]: "created",
        [Proto.TriggerStatus.STATUS_ARMED]: "armed",
        [Proto.TriggerStatus.STATUS_RUNNING]: "running",
        [Proto.TriggerStatus.STATUS_COMPLETED]: "completed",
        [Proto.TriggerStatus.STATUS_CANCELED]: "cancelled",
        [Proto.TriggerStatus.STATUS_FAILED]: "failed",
        [Proto.TriggerStatus.STATUS_PAUSED]: "paused",
    } satisfies ProtoToOutput<Proto.TriggerStatus, TriggerStatusLabelValue>,
} as const;

export const TriggerEventTypeCodec = {
    inputToProto: {
        fired: Proto.TriggerEventType.EVENT_FIRED,
        canceled: Proto.TriggerEventType.EVENT_CANCELED,
        updated: Proto.TriggerEventType.EVENT_UPDATED,
        failed: Proto.TriggerEventType.EVENT_FAILED,
        activated: Proto.TriggerEventType.EVENT_ACTIVATED,
    } satisfies InputToProto<TriggerEventTypeValue, Proto.TriggerEventType>,
    protoToOutput: {
        [Proto.TriggerEventType.EVENT_UNSPECIFIED]: "unspecified",
        [Proto.TriggerEventType.EVENT_FIRED]: "fired",
        [Proto.TriggerEventType.EVENT_CANCELED]: "canceled",
        [Proto.TriggerEventType.EVENT_UPDATED]: "updated",
        [Proto.TriggerEventType.EVENT_FAILED]: "failed",
        [Proto.TriggerEventType.EVENT_ACTIVATED]: "activated",
    } satisfies ProtoToOutput<Proto.TriggerEventType, TriggerEventTypeLabelValue>,
} as const;

export const TriggerCancelReasonCodec = {
    protoToOutput: {
        [Proto.TriggerCancelReason.UNSPECIFIED]: "unspecified",
        [Proto.TriggerCancelReason.USER_REQUEST]: "user_request",
        [Proto.TriggerCancelReason.OCO]: "oco",
        [Proto.TriggerCancelReason.PARENT_CANCELED_NO_FILL]: "parent_canceled_no_fill",
        [Proto.TriggerCancelReason.SELF_TRADE_PREVENTION]: "self_trade_prevention",
        [Proto.TriggerCancelReason.ACCOUNT_REPAIR]: "account_repair",
        [Proto.TriggerCancelReason.PAIR_DRAIN_TRIGGER]: "pair_drain_trigger",
        [Proto.TriggerCancelReason.PAIR_DRAIN_TWAP]: "pair_drain_twap",
        [Proto.TriggerCancelReason.PAIR_DRAIN_LADDER]: "pair_drain_ladder",
        [Proto.TriggerCancelReason.PAIR_DRAIN_ATTACHED_LEG]: "pair_drain_attached_leg",
        [Proto.TriggerCancelReason.MISSING_REASON_CODE]: "missing_reason_code",
        [Proto.TriggerCancelReason.INTERNAL_ERROR]: "internal_error",
    } satisfies ProtoToOutput<Proto.TriggerCancelReason, TriggerCancelReasonLabelValue>,
} as const;

export const TriggerFailureReasonCodec = {
    protoToOutput: {
        [Proto.TriggerFailureReason.UNSPECIFIED]: "unspecified",
        [Proto.TriggerFailureReason.UNKNOWN_SYMBOL]: "unknown_symbol",
        [Proto.TriggerFailureReason.PAIR_DISABLED]: "pair_disabled",
        [Proto.TriggerFailureReason.MIN_NOTIONAL]: "min_notional",
        [Proto.TriggerFailureReason.TICK_SIZE]: "tick_size",
        [Proto.TriggerFailureReason.INSUFFICIENT_FUNDS]: "insufficient_funds",
        [Proto.TriggerFailureReason.RISK_LIMIT]: "risk_limit",
        [Proto.TriggerFailureReason.DUPLICATE_CLIENT_ID]: "duplicate_client_id",
        [Proto.TriggerFailureReason.MARKET_HALTED]: "market_halted",
        [Proto.TriggerFailureReason.ENGINE_BUSY]: "engine_busy",
        [Proto.TriggerFailureReason.ACCOUNT_UNKNOWN]: "account_unknown",
        [Proto.TriggerFailureReason.ORDER_UNKNOWN]: "order_unknown",
        [Proto.TriggerFailureReason.POST_ONLY_CROSS]: "post_only_cross",
        [Proto.TriggerFailureReason.REDUCE_ONLY_BLOCKED]: "reduce_only_blocked",
        [Proto.TriggerFailureReason.PRICE_BAND_VIOLATION]: "price_band_violation",
        [Proto.TriggerFailureReason.MARKET_CAP_VIOLATION]: "market_cap_violation",
        [Proto.TriggerFailureReason.EMPTY_BOOK]: "empty_book",
        [Proto.TriggerFailureReason.FOK_INSUFFICIENT_LIQUIDITY]: "fok_insufficient_liquidity",
        [Proto.TriggerFailureReason.FEE_ASSET_NOT_ALLOWED]: "fee_asset_not_allowed",
        [Proto.TriggerFailureReason.MARKET_PRICE_UNAVAILABLE]: "market_price_unavailable",
        [Proto.TriggerFailureReason.STALE_QUOTE]: "stale_quote",
        [Proto.TriggerFailureReason.MIN_QUANTITY]: "min_quantity",
        [Proto.TriggerFailureReason.STEP_SIZE]: "step_size",
        [Proto.TriggerFailureReason.INVALID_SIZING]: "invalid_sizing",
        [Proto.TriggerFailureReason.MAX_QUOTE_DEBIT_TOO_SMALL]: "max_quote_debit_too_small",
        [Proto.TriggerFailureReason.FEE_CEILING_EXCEEDED]: "fee_ceiling_exceeded",
        [Proto.TriggerFailureReason.TRIGGER_PRICE_INVALID]: "trigger_price_invalid",
        [Proto.TriggerFailureReason.TRIGGER_PRICE_SOURCE_UNSUPPORTED]:
            "trigger_price_source_unsupported",
        [Proto.TriggerFailureReason.TRAILING_DISTANCE_INVALID]: "trailing_distance_invalid",
        [Proto.TriggerFailureReason.MODIFICATION_REQUIRES_REPLACE]: "modification_requires_replace",
        [Proto.TriggerFailureReason.ORDER_ALREADY_TERMINAL]: "order_already_terminal",
        [Proto.TriggerFailureReason.CONFLICT_IDEMPOTENCY_KEY_REUSE]:
            "conflict_idempotency_key_reuse",
        [Proto.TriggerFailureReason.RATE_LIMITED]: "rate_limited",
        [Proto.TriggerFailureReason.POLICY_SPOT_TRADE_DENY]: "policy_spot_trade_deny",
        [Proto.TriggerFailureReason.POLICY_MARKET_DENY]: "policy_market_deny",
        [Proto.TriggerFailureReason.POLICY_MAX_NOTIONAL]: "policy_max_notional",
        [Proto.TriggerFailureReason.POLICY_MAX_OPEN_ORDERS]: "policy_max_open_orders",
        [Proto.TriggerFailureReason.POLICY_TRADING_HALTED]: "policy_trading_halted",
        [Proto.TriggerFailureReason.MAX_SLIPPAGE_INVALID]: "max_slippage_invalid",
        [Proto.TriggerFailureReason.INVALID_TIME_IN_FORCE]: "invalid_time_in_force",
        [Proto.TriggerFailureReason.DUPLICATE_ORDER_ID]: "duplicate_order_id",
        [Proto.TriggerFailureReason.MAX_QUANTITY]: "max_quantity",
        [Proto.TriggerFailureReason.MAX_NOTIONAL]: "max_notional",
        [Proto.TriggerFailureReason.PAIR_POST_ONLY]: "pair_post_only",
        [Proto.TriggerFailureReason.MAX_OPEN_ORDERS_TOTAL]: "max_open_orders_total",
        [Proto.TriggerFailureReason.STP_MODE_NOT_ALLOWED]: "stp_mode_not_allowed",
        [Proto.TriggerFailureReason.PAIR_BACKLOGGED]: "pair_backlogged",
        [Proto.TriggerFailureReason.MODE_NOT_SUPPORTED]: "mode_not_supported",
        [Proto.TriggerFailureReason.MARKET_QUOTE_STALE]: "market_quote_stale",
        [Proto.TriggerFailureReason.MARKET_QUOTE_UNHEALTHY]: "market_quote_unhealthy",
        [Proto.TriggerFailureReason.QTY_INVALID]: "qty_invalid",
        [Proto.TriggerFailureReason.LIMIT_PRICE_INVALID]: "limit_price_invalid",
        [Proto.TriggerFailureReason.TWAP_INTERVAL_INVALID]: "twap_interval_invalid",
        [Proto.TriggerFailureReason.LADDER_RANGE_TOO_NARROW]: "ladder_range_too_narrow",
        [Proto.TriggerFailureReason.LADDER_LEVELS_INVALID]: "ladder_levels_invalid",
        [Proto.TriggerFailureReason.ATTACHED_LEGS_EXCEEDED]: "attached_legs_exceeded",
        [Proto.TriggerFailureReason.PRICE_LEVELS_EXHAUSTED]: "price_levels_exhausted",
        [Proto.TriggerFailureReason.SETTLEMENT_BACKLOGGED]: "settlement_backlogged",
        [Proto.TriggerFailureReason.CLIENT_ORDER_IDS_EXHAUSTED]: "client_order_ids_exhausted",
        [Proto.TriggerFailureReason.INVALID_ORDER_ID]: "invalid_order_id",
        [Proto.TriggerFailureReason.ORDER_ID_CONFLICT]: "order_id_conflict",
        [Proto.TriggerFailureReason.INVALID_SIDE]: "invalid_side",
        [Proto.TriggerFailureReason.INVALID_ORDER_TYPE]: "invalid_order_type",
        [Proto.TriggerFailureReason.INVALID_STP_MODE]: "invalid_stp_mode",
        [Proto.TriggerFailureReason.INVALID_ORDER_FLAGS]: "invalid_order_flags",
        [Proto.TriggerFailureReason.PRICE_LEVEL_QUANTITY_LIMIT]: "price_level_quantity_limit",
        [Proto.TriggerFailureReason.CHILD_QTY_RAISE_NOT_ALLOWED]: "child_qty_raise_not_allowed",
        [Proto.TriggerFailureReason.TRIGGERS_EXHAUSTED]: "triggers_exhausted",
        [Proto.TriggerFailureReason.ORDER_SEQUENCE_EXHAUSTED]: "order_sequence_exhausted",
        [Proto.TriggerFailureReason.FEE_SCHEDULE_UNAVAILABLE]: "fee_schedule_unavailable",
        [Proto.TriggerFailureReason.POLICY_UNAVAILABLE]: "policy_unavailable",
        [Proto.TriggerFailureReason.ACCOUNT_ROUTING_INVALID]: "account_routing_invalid",
        [Proto.TriggerFailureReason.CLIENT_TRIGGER_ID_INVALID]: "client_trigger_id_invalid",
        [Proto.TriggerFailureReason.TRIGGER_DIRECTION_INVALID]: "trigger_direction_invalid",
        [Proto.TriggerFailureReason.FEE_ASSET_INVALID]: "fee_asset_invalid",
        [Proto.TriggerFailureReason.FEE_CEILING_INVALID]: "fee_ceiling_invalid",
        [Proto.TriggerFailureReason.UNSUPPORTED_FIELD_SET]: "unsupported_field_set",
        [Proto.TriggerFailureReason.TRIGGER_FIRE_LIMIT_REACHED]: "trigger_fire_limit_reached",
        [Proto.TriggerFailureReason.CONDITION_FLAGS_INVALID]: "condition_flags_invalid",
        [Proto.TriggerFailureReason.CONDITION_PARAMETER_SET]: "condition_parameter_set",
        [Proto.TriggerFailureReason.SLIPPAGE_TICKS_INVALID]: "slippage_ticks_invalid",
        [Proto.TriggerFailureReason.SLIPPAGE_BPS_INVALID]: "slippage_bps_invalid",
        [Proto.TriggerFailureReason.SLIPPAGE_BOUNDS_CONFLICT]: "slippage_bounds_conflict",
        [Proto.TriggerFailureReason.LIMIT_CHILD_SLIPPAGE_SET]: "limit_child_slippage_set",
        [Proto.TriggerFailureReason.NEW_ACCOUNT_CAPACITY_REACHED]: "new_account_capacity_reached",
        [Proto.TriggerFailureReason.ORDER_TYPE_NOT_ALLOWED_IN_AUCTION]:
            "order_type_not_allowed_in_auction",
        [Proto.TriggerFailureReason.POST_ONLY_NOT_ALLOWED_IN_AUCTION]:
            "post_only_not_allowed_in_auction",
        [Proto.TriggerFailureReason.TWAP_CAPACITY_REACHED]: "twap_capacity_reached",
        [Proto.TriggerFailureReason.ORDER_LIMITS_UNAVAILABLE]: "order_limits_unavailable",
        [Proto.TriggerFailureReason.CHILD_ORDER_INCONSISTENT]: "child_order_inconsistent",
        [Proto.TriggerFailureReason.INDEX_PRICE_UNAVAILABLE]: "index_price_unavailable",
        [Proto.TriggerFailureReason.TRIGGER_WOULD_TRIGGER_IMMEDIATELY]:
            "trigger_would_trigger_immediately",
        [Proto.TriggerFailureReason.MISSING_REASON_CODE]: "missing_reason_code",
        [Proto.TriggerFailureReason.INTERNAL_ERROR]: "internal_error",
    } satisfies ProtoToOutput<Proto.TriggerFailureReason, TriggerFailureReasonLabelValue>,
} as const;

export const TriggerDirectionCodec = {
    inputToProto: {
        above: ProtoOrders.TriggerDirection.ABOVE,
        below: ProtoOrders.TriggerDirection.BELOW,
    } satisfies InputToProto<TriggerDirectionValue, ProtoOrders.TriggerDirection>,
    protoToOutput: {
        [ProtoOrders.TriggerDirection.TRIGGER_DIRECTION_UNSPECIFIED]: "unspecified",
        [ProtoOrders.TriggerDirection.ABOVE]: "above",
        [ProtoOrders.TriggerDirection.BELOW]: "below",
    } satisfies ProtoToOutput<ProtoOrders.TriggerDirection, TriggerDirectionValue>,
} as const;

export const LadderDistributionCodec = {
    inputToProto: {
        linear: Proto.LadderDistribution.LINEAR,
    } satisfies InputToProto<LadderDistributionValue, Proto.LadderDistribution>,
    protoToOutput: {
        [Proto.LadderDistribution.LADDER_DISTRIBUTION_UNSPECIFIED]: "unspecified",
        [Proto.LadderDistribution.LINEAR]: "linear",
        [Proto.LadderDistribution.GEOMETRIC]: "geometric",
        [Proto.LadderDistribution.WEIGHTED_FAVORABLE]: "weighted_favorable",
    } satisfies ProtoToOutput<Proto.LadderDistribution, LadderDistributionLabelValue>,
} as const;
