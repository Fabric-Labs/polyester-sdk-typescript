import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";

export const TRIGGER_TYPE_VALUES = [
    "stop_loss",
    "take_profit",
    "trailing_stop",
    "twap",
    "ladder",
] as const;
export type TriggerTypeValue = (typeof TRIGGER_TYPE_VALUES)[number];

export const TRIGGER_TYPE_LABEL_VALUES = ["unknown", ...TRIGGER_TYPE_VALUES] as const;
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

export const TRIGGER_STATUS_LABEL_VALUES = ["unknown", ...TRIGGER_STATUS_FILTER_VALUES] as const;
export type TriggerStatusLabelValue = (typeof TRIGGER_STATUS_LABEL_VALUES)[number];

export const TRIGGER_EVENT_TYPE_LABEL_VALUES = ["unknown", "fired", "canceled", "updated"] as const;
export type TriggerEventTypeLabelValue = (typeof TRIGGER_EVENT_TYPE_LABEL_VALUES)[number];

export const TRIGGER_SIDE_VALUES = ["buy", "sell"] as const;
export type TriggerSideValue = (typeof TRIGGER_SIDE_VALUES)[number];

export const ORDER_TYPE_VALUES = ["limit", "market"] as const;
export type OrderTypeValue = (typeof ORDER_TYPE_VALUES)[number];

export const TIF_VALUES = ["gtc", "ioc", "fok"] as const;
export type TifValue = (typeof TIF_VALUES)[number];

export const FEE_SOURCE_VALUES = ["quote", "received"] as const;
export type FeeSourceValue = (typeof FEE_SOURCE_VALUES)[number];

export const STP_MODE_VALUES = ["expire_taker", "expire_maker", "expire_both"] as const;
export type StpModeValue = (typeof STP_MODE_VALUES)[number];

export const TRIGGER_PRICE_SOURCE_VALUES = ["last", "index", "mark"] as const;
export type TriggerPriceSourceValue = (typeof TRIGGER_PRICE_SOURCE_VALUES)[number];

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
    } satisfies Record<TriggerTypeValue, Proto.TriggerType>,
    protoToLabel: {
        [Proto.TriggerType.TRIGGER_TYPE_UNSPECIFIED]: "unknown",
        [Proto.TriggerType.STOP_LOSS]: "stop_loss",
        [Proto.TriggerType.TAKE_PROFIT]: "take_profit",
        [Proto.TriggerType.TRAILING_STOP]: "trailing_stop",
        [Proto.TriggerType.TWAP]: "twap",
        [Proto.TriggerType.LADDER]: "ladder",
    } satisfies Record<Proto.TriggerType, TriggerTypeLabelValue>,
} as const;

export const TriggerStatusCodec = {
    filterToProto: {
        created: Proto.TriggerStatus.CREATED,
        armed: Proto.TriggerStatus.ARMED,
        running: Proto.TriggerStatus.RUNNING,
        completed: Proto.TriggerStatus.COMPLETED,
        cancelled: Proto.TriggerStatus.CANCELLED,
        failed: Proto.TriggerStatus.FAILED,
        paused: Proto.TriggerStatus.PAUSED,
    } satisfies Record<TriggerStatusFilterValue, Proto.TriggerStatus>,
    protoToLabel: {
        [Proto.TriggerStatus.TRIGGER_STATUS_UNSPECIFIED]: "unknown",
        [Proto.TriggerStatus.CREATED]: "created",
        [Proto.TriggerStatus.ARMED]: "armed",
        [Proto.TriggerStatus.RUNNING]: "running",
        [Proto.TriggerStatus.COMPLETED]: "completed",
        [Proto.TriggerStatus.CANCELLED]: "cancelled",
        [Proto.TriggerStatus.FAILED]: "failed",
        [Proto.TriggerStatus.PAUSED]: "paused",
    } satisfies Record<Proto.TriggerStatus, TriggerStatusLabelValue>,
} as const;

export const TriggerEventTypeCodec = {
    protoToLabel: {
        [Proto.TriggerEventType.TRIGGER_EVENT_TYPE_UNSPECIFIED]: "unknown",
        [Proto.TriggerEventType.FIRED]: "fired",
        [Proto.TriggerEventType.CANCELED]: "canceled",
        [Proto.TriggerEventType.UPDATED]: "updated",
    } satisfies Record<Proto.TriggerEventType, TriggerEventTypeLabelValue>,
} as const;

export const TriggerSideCodec = {
    inputToProto: {
        buy: ProtoOrders.Side.BUY,
        sell: ProtoOrders.Side.SELL,
    } satisfies Record<TriggerSideValue, ProtoOrders.Side>,
} as const;

export const OrderTypeCodec = {
    inputToProto: {
        limit: ProtoOrders.OrderType.LIMIT,
        market: ProtoOrders.OrderType.MARKET,
    } satisfies Record<OrderTypeValue, ProtoOrders.OrderType>,
} as const;

export const TifCodec = {
    inputToProto: {
        gtc: ProtoOrders.TIF.GTC,
        ioc: ProtoOrders.TIF.IOC,
        fok: ProtoOrders.TIF.FOK,
    } satisfies Record<TifValue, ProtoOrders.TIF>,
} as const;

export const FeeSourceCodec = {
    inputToProto: {
        quote: ProtoOrders.FeeSource.QUOTE,
        received: ProtoOrders.FeeSource.RECEIVED,
    } satisfies Record<FeeSourceValue, ProtoOrders.FeeSource>,
} as const;

export const StpModeCodec = {
    inputToProto: {
        expire_taker: ProtoOrders.STPMode.EXPIRE_TAKER,
        expire_maker: ProtoOrders.STPMode.EXPIRE_MAKER,
        expire_both: ProtoOrders.STPMode.EXPIRE_BOTH,
    } satisfies Record<StpModeValue, ProtoOrders.STPMode>,
} as const;

export const TriggerPriceSourceCodec = {
    inputToProto: {
        last: ProtoOrders.TriggerPriceSource.LAST_PRICE,
        index: ProtoOrders.TriggerPriceSource.INDEX_PRICE,
        mark: ProtoOrders.TriggerPriceSource.MARK_PRICE,
    } satisfies Record<TriggerPriceSourceValue, ProtoOrders.TriggerPriceSource>,
    protoToLabel: {
        [ProtoOrders.TriggerPriceSource.TRIGGER_PRICE_SOURCE_UNSPECIFIED]: "last",
        [ProtoOrders.TriggerPriceSource.LAST_PRICE]: "last",
        [ProtoOrders.TriggerPriceSource.INDEX_PRICE]: "index",
        [ProtoOrders.TriggerPriceSource.MARK_PRICE]: "mark",
    } satisfies Record<ProtoOrders.TriggerPriceSource, TriggerPriceSourceValue>,
} as const;

export const TriggerDirectionCodec = {
    inputToProto: {
        above: ProtoOrders.TriggerDirection.ABOVE,
        below: ProtoOrders.TriggerDirection.BELOW,
    } satisfies Record<TriggerDirectionValue, ProtoOrders.TriggerDirection>,
    protoToLabel: {
        [ProtoOrders.TriggerDirection.TRIGGER_DIRECTION_UNSPECIFIED]: "above",
        [ProtoOrders.TriggerDirection.ABOVE]: "above",
        [ProtoOrders.TriggerDirection.BELOW]: "below",
    } satisfies Record<ProtoOrders.TriggerDirection, TriggerDirectionValue>,
} as const;

export const LadderDistributionCodec = {
    inputToProto: {
        linear: Proto.LadderDistribution.LINEAR,
    } satisfies Record<LadderDistributionValue, Proto.LadderDistribution>,
    protoToLabel: {
        [Proto.LadderDistribution.LADDER_DISTRIBUTION_UNSPECIFIED]: "linear",
        [Proto.LadderDistribution.LINEAR]: "linear",
        [Proto.LadderDistribution.GEOMETRIC]: "geometric",
        [Proto.LadderDistribution.WEIGHTED_FAVORABLE]: "weighted_favorable",
    } satisfies Record<Proto.LadderDistribution, LadderDistributionLabelValue>,
} as const;
