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

export const TRIGGER_EVENT_TYPE_VALUES = ["fired", "canceled", "updated", "failed"] as const;
export type TriggerEventTypeValue = (typeof TRIGGER_EVENT_TYPE_VALUES)[number];

export const TRIGGER_EVENT_TYPE_LABEL_VALUES = TRIGGER_EVENT_TYPE_VALUES;
export type TriggerEventTypeLabelValue = (typeof TRIGGER_EVENT_TYPE_LABEL_VALUES)[number];

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
    } satisfies InputToProto<TriggerEventTypeValue, Proto.TriggerEventType>,
    protoToOutput: {
        [Proto.TriggerEventType.EVENT_UNSPECIFIED]: "unspecified",
        [Proto.TriggerEventType.EVENT_FIRED]: "fired",
        [Proto.TriggerEventType.EVENT_CANCELED]: "canceled",
        [Proto.TriggerEventType.EVENT_UPDATED]: "updated",
        [Proto.TriggerEventType.EVENT_FAILED]: "failed",
    } satisfies ProtoToOutput<Proto.TriggerEventType, TriggerEventTypeLabelValue>,
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
