import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";
export {
    FEE_SOURCE_VALUES,
    FeeSourceCodec,
    type FeeSourceValue,
    ORDER_SIDE_VALUES as TRIGGER_SIDE_VALUES,
    ORDER_TYPE_VALUES,
    OrderSideCodec as TriggerSideCodec,
    type OrderSideValue as TriggerSideValue,
    OrderTypeCodec,
    type OrderTypeValue,
    STP_MODE_VALUES,
    StpModeCodec,
    type StpModeValue,
    TIF_OUTPUT_VALUES,
    TIF_VALUES,
    TifCodec,
    type TifOutputValue,
    type TifValue,
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

export const TRIGGER_EVENT_TYPE_LABEL_VALUES = ["fired", "canceled", "updated"] as const;
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
        [Proto.TriggerType.STOP_LOSS]: "stop_loss",
        [Proto.TriggerType.TAKE_PROFIT]: "take_profit",
        [Proto.TriggerType.TRAILING_STOP]: "trailing_stop",
        [Proto.TriggerType.TWAP]: "twap",
        [Proto.TriggerType.LADDER]: "ladder",
    } satisfies ProtoToOutput<Proto.TriggerType, TriggerTypeLabelValue>,
} as const;

export const TriggerStatusCodec = {
    inputToProto: {
        created: Proto.TriggerStatus.CREATED,
        armed: Proto.TriggerStatus.ARMED,
        running: Proto.TriggerStatus.RUNNING,
        completed: Proto.TriggerStatus.COMPLETED,
        cancelled: Proto.TriggerStatus.CANCELLED,
        failed: Proto.TriggerStatus.FAILED,
        paused: Proto.TriggerStatus.PAUSED,
    } satisfies InputToProto<TriggerStatusFilterValue, Proto.TriggerStatus>,
    protoToOutput: {
        [Proto.TriggerStatus.CREATED]: "created",
        [Proto.TriggerStatus.ARMED]: "armed",
        [Proto.TriggerStatus.RUNNING]: "running",
        [Proto.TriggerStatus.COMPLETED]: "completed",
        [Proto.TriggerStatus.CANCELLED]: "cancelled",
        [Proto.TriggerStatus.FAILED]: "failed",
        [Proto.TriggerStatus.PAUSED]: "paused",
    } satisfies ProtoToOutput<Proto.TriggerStatus, TriggerStatusLabelValue>,
} as const;

export const TriggerEventTypeCodec = {
    protoToOutput: {
        [Proto.TriggerEventType.FIRED]: "fired",
        [Proto.TriggerEventType.CANCELED]: "canceled",
        [Proto.TriggerEventType.UPDATED]: "updated",
    } satisfies ProtoToOutput<Proto.TriggerEventType, TriggerEventTypeLabelValue>,
} as const;

export const TriggerDirectionCodec = {
    inputToProto: {
        above: ProtoOrders.TriggerDirection.ABOVE,
        below: ProtoOrders.TriggerDirection.BELOW,
    } satisfies InputToProto<TriggerDirectionValue, ProtoOrders.TriggerDirection>,
    protoToOutput: {
        [ProtoOrders.TriggerDirection.ABOVE]: "above",
        [ProtoOrders.TriggerDirection.BELOW]: "below",
    } satisfies ProtoToOutput<ProtoOrders.TriggerDirection, TriggerDirectionValue>,
} as const;

export const LadderDistributionCodec = {
    inputToProto: {
        linear: Proto.LadderDistribution.LINEAR,
    } satisfies InputToProto<LadderDistributionValue, Proto.LadderDistribution>,
    protoToOutput: {
        [Proto.LadderDistribution.LINEAR]: "linear",
        [Proto.LadderDistribution.GEOMETRIC]: "geometric",
        [Proto.LadderDistribution.WEIGHTED_FAVORABLE]: "weighted_favorable",
    } satisfies ProtoToOutput<Proto.LadderDistribution, LadderDistributionLabelValue>,
} as const;
