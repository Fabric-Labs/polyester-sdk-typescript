import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

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
    } satisfies InputToProto<TriggerTypeValue, Proto.TriggerType>,
    protoToLabel: {
        [Proto.TriggerType.STOP_LOSS]: "stop_loss",
        [Proto.TriggerType.TAKE_PROFIT]: "take_profit",
        [Proto.TriggerType.TRAILING_STOP]: "trailing_stop",
        [Proto.TriggerType.TWAP]: "twap",
        [Proto.TriggerType.LADDER]: "ladder",
    } satisfies ProtoToOutput<Proto.TriggerType, TriggerTypeLabelValue>,
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
    } satisfies InputToProto<TriggerStatusFilterValue, Proto.TriggerStatus>,
    protoToLabel: {
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
    protoToLabel: {
        [Proto.TriggerEventType.FIRED]: "fired",
        [Proto.TriggerEventType.CANCELED]: "canceled",
        [Proto.TriggerEventType.UPDATED]: "updated",
    } satisfies ProtoToOutput<Proto.TriggerEventType, TriggerEventTypeLabelValue>,
} as const;

export const TriggerSideCodec = {
    inputToProto: {
        buy: ProtoOrders.Side.BUY,
        sell: ProtoOrders.Side.SELL,
    } satisfies InputToProto<TriggerSideValue, ProtoOrders.Side>,
} as const;

export const OrderTypeCodec = {
    inputToProto: {
        limit: ProtoOrders.OrderType.LIMIT,
        market: ProtoOrders.OrderType.MARKET,
    } satisfies InputToProto<OrderTypeValue, ProtoOrders.OrderType>,
} as const;

export const TifCodec = {
    inputToProto: {
        gtc: ProtoOrders.TIF.GTC,
        ioc: ProtoOrders.TIF.IOC,
        fok: ProtoOrders.TIF.FOK,
    } satisfies InputToProto<TifValue, ProtoOrders.TIF>,
} as const;

export const FeeSourceCodec = {
    inputToProto: {
        quote: ProtoOrders.FeeSource.QUOTE,
        received: ProtoOrders.FeeSource.RECEIVED,
    } satisfies InputToProto<FeeSourceValue, ProtoOrders.FeeSource>,
} as const;

export const StpModeCodec = {
    inputToProto: {
        expire_taker: ProtoOrders.STPMode.EXPIRE_TAKER,
        expire_maker: ProtoOrders.STPMode.EXPIRE_MAKER,
        expire_both: ProtoOrders.STPMode.EXPIRE_BOTH,
    } satisfies InputToProto<StpModeValue, ProtoOrders.STPMode>,
} as const;

export const TriggerPriceSourceCodec = {
    inputToProto: {
        last: ProtoOrders.TriggerPriceSource.LAST_PRICE,
        index: ProtoOrders.TriggerPriceSource.INDEX_PRICE,
        mark: ProtoOrders.TriggerPriceSource.MARK_PRICE,
    } satisfies InputToProto<TriggerPriceSourceValue, ProtoOrders.TriggerPriceSource>,
    protoToLabel: {
        [ProtoOrders.TriggerPriceSource.LAST_PRICE]: "last",
        [ProtoOrders.TriggerPriceSource.INDEX_PRICE]: "index",
        [ProtoOrders.TriggerPriceSource.MARK_PRICE]: "mark",
    } satisfies ProtoToOutput<ProtoOrders.TriggerPriceSource, TriggerPriceSourceValue>,
} as const;

export const TriggerDirectionCodec = {
    inputToProto: {
        above: ProtoOrders.TriggerDirection.ABOVE,
        below: ProtoOrders.TriggerDirection.BELOW,
    } satisfies InputToProto<TriggerDirectionValue, ProtoOrders.TriggerDirection>,
    protoToLabel: {
        [ProtoOrders.TriggerDirection.ABOVE]: "above",
        [ProtoOrders.TriggerDirection.BELOW]: "below",
    } satisfies ProtoToOutput<ProtoOrders.TriggerDirection, TriggerDirectionValue>,
} as const;

export const LadderDistributionCodec = {
    inputToProto: {
        linear: Proto.LadderDistribution.LINEAR,
    } satisfies InputToProto<LadderDistributionValue, Proto.LadderDistribution>,
    protoToLabel: {
        [Proto.LadderDistribution.LINEAR]: "linear",
        [Proto.LadderDistribution.GEOMETRIC]: "geometric",
        [Proto.LadderDistribution.WEIGHTED_FAVORABLE]: "weighted_favorable",
    } satisfies ProtoToOutput<Proto.LadderDistribution, LadderDistributionLabelValue>,
} as const;
