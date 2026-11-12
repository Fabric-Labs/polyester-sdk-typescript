import * as Proto from "../../gen/alerts/v1/price_alerts_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const PRICE_ALERT_DIRECTION_VALUES = ["above", "below"] as const;
/** `above` fires at or above the alert price, `below` at or below it. */
export type PriceAlertDirection = (typeof PRICE_ALERT_DIRECTION_VALUES)[number];

export const PRICE_ALERT_PRICE_SOURCE_VALUES = ["last_price", "index_price"] as const;
export type PriceAlertPriceSource = (typeof PRICE_ALERT_PRICE_SOURCE_VALUES)[number];

export const PRICE_ALERT_STATUS_VALUES = ["active", "triggered", "canceled"] as const;
export type PriceAlertStatus = (typeof PRICE_ALERT_STATUS_VALUES)[number];

export const PRICE_ALERT_CHANNEL_VALUES = ["in_app", "telegram"] as const;
export type PriceAlertChannel = (typeof PRICE_ALERT_CHANNEL_VALUES)[number];

export const PRICE_ALERT_UPDATE_OUTCOME_VALUES = ["applied", "unchanged", "replayed"] as const;
/**
 * What an update did: `applied` changed the alert, `unchanged` found it already as requested,
 * and `replayed` recognized a reused idempotency key and changed nothing.
 */
export type PriceAlertUpdateOutcome = (typeof PRICE_ALERT_UPDATE_OUTCOME_VALUES)[number];

export const PriceAlertDirectionCodec = {
    inputToProto: {
        above: Proto.AlertDirection.ABOVE,
        below: Proto.AlertDirection.BELOW,
    } satisfies InputToProto<PriceAlertDirection, Proto.AlertDirection>,
    protoToOutput: {
        [Proto.AlertDirection.DIRECTION_UNSPECIFIED]: "unspecified",
        [Proto.AlertDirection.ABOVE]: "above",
        [Proto.AlertDirection.BELOW]: "below",
    } satisfies ProtoToOutput<Proto.AlertDirection, PriceAlertDirection>,
} as const;

export const PriceAlertPriceSourceCodec = {
    inputToProto: {
        last_price: Proto.AlertPriceSource.LAST_PRICE,
        index_price: Proto.AlertPriceSource.INDEX_PRICE,
    } satisfies InputToProto<PriceAlertPriceSource, Proto.AlertPriceSource>,
    protoToOutput: {
        [Proto.AlertPriceSource.PRICE_SOURCE_UNSPECIFIED]: "unspecified",
        [Proto.AlertPriceSource.LAST_PRICE]: "last_price",
        [Proto.AlertPriceSource.INDEX_PRICE]: "index_price",
    } satisfies ProtoToOutput<Proto.AlertPriceSource, PriceAlertPriceSource>,
} as const;

export const PriceAlertStatusCodec = {
    inputToProto: {
        active: Proto.AlertStatus.ACTIVE,
        triggered: Proto.AlertStatus.TRIGGERED,
        canceled: Proto.AlertStatus.CANCELLED,
    } satisfies InputToProto<PriceAlertStatus, Proto.AlertStatus>,
    protoToOutput: {
        [Proto.AlertStatus.STATUS_UNSPECIFIED]: "unspecified",
        [Proto.AlertStatus.ACTIVE]: "active",
        [Proto.AlertStatus.TRIGGERED]: "triggered",
        [Proto.AlertStatus.CANCELLED]: "canceled",
    } satisfies ProtoToOutput<Proto.AlertStatus, PriceAlertStatus>,
} as const;

export const PriceAlertChannelCodec = {
    inputToProto: {
        in_app: Proto.AlertChannel.IN_APP,
        telegram: Proto.AlertChannel.TELEGRAM,
    } satisfies InputToProto<PriceAlertChannel, Proto.AlertChannel>,
    protoToOutput: {
        [Proto.AlertChannel.CHANNEL_UNSPECIFIED]: "unspecified",
        [Proto.AlertChannel.IN_APP]: "in_app",
        [Proto.AlertChannel.TELEGRAM]: "telegram",
    } satisfies ProtoToOutput<Proto.AlertChannel, PriceAlertChannel>,
} as const;

export const PriceAlertUpdateOutcomeCodec = {
    protoToOutput: {
        [Proto.UpdateOutcome.UPDATE_OUTCOME_UNSPECIFIED]: "unspecified",
        [Proto.UpdateOutcome.APPLIED]: "applied",
        [Proto.UpdateOutcome.UNCHANGED]: "unchanged",
        [Proto.UpdateOutcome.REPLAYED]: "replayed",
    } satisfies ProtoToOutput<Proto.UpdateOutcome, PriceAlertUpdateOutcome>,
} as const;
