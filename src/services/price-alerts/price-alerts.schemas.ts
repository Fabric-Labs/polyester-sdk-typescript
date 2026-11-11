import * as v from "valibot";
import { PRICE_SCALE } from "../../catalogs/readers.js";
import {
    positiveDecimalInputToScaled,
    scaledToDecimalOutput,
} from "../../shared/decimal-surface.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    idInputSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import { PROTOBUF_UINT64_MAX } from "../../shared/wire-bounds.js";
import { buildProtoPatch, defineProtoPatchFields } from "../../utils/proto-patch.js";
import { SymbolIdInputSchema } from "../shared.js";
import {
    PRICE_ALERT_CHANNEL_VALUES,
    PRICE_ALERT_DIRECTION_VALUES,
    PRICE_ALERT_PRICE_SOURCE_VALUES,
    PRICE_ALERT_STATUS_VALUES,
    PriceAlertChannelCodec,
    PriceAlertDirectionCodec,
    PriceAlertPriceSourceCodec,
    PriceAlertStatusCodec,
    PriceAlertUpdateOutcomeCodec,
    type PriceAlertDirection,
} from "./price-alerts.codecs.js";

const AlertIdInputSchema = idInputSchema("alertId");

/** Decimal alert price; sent as int64 ticks at the protocol price scale (1e9). */
function priceInputSchema(field: string) {
    return v.pipe(
        v.string(),
        v.transform((price) => positiveDecimalInputToScaled(field, price, PRICE_SCALE)),
    );
}

/** One to two distinct delivery channels, sent in ascending enum order. */
const ChannelsInputSchema = v.pipe(
    v.array(v.picklist(PRICE_ALERT_CHANNEL_VALUES)),
    v.minLength(1, "At least one channel is required."),
    v.maxLength(2, "At most two channels are allowed."),
    v.check((channels) => new Set(channels).size === channels.length, "Channels must be distinct."),
    v.transform((channels) =>
        channels.map((channel) => PriceAlertChannelCodec.inputToProto[channel]).sort(),
    ),
);

const IdempotencyKeySchema = v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)));

export const CreatePriceAlertInputSchema = v.pipe(
    v.strictObject({
        symbolId: SymbolIdInputSchema,
        direction: v.picklist(PRICE_ALERT_DIRECTION_VALUES),
        /** Omit to watch the index price on markets that have one, else the last price. */
        priceSource: v.optional(v.picklist(PRICE_ALERT_PRICE_SOURCE_VALUES)),
        /** Alert price as a decimal string, e.g. `"90000"`. */
        price: priceInputSchema("price"),
        channels: ChannelsInputSchema,
        /** Reusing a key with the same request returns the alert it created. */
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.transform(({ direction, priceSource, price, ...input }) => ({
        ...input,
        direction: PriceAlertDirectionCodec.inputToProto[direction],
        priceSource: priceSource && PriceAlertPriceSourceCodec.inputToProto[priceSource],
        priceTicks: price,
    })),
);

export type CreatePriceAlertInput = v.InferInput<typeof CreatePriceAlertInputSchema>;

export const ListPriceAlertsInputSchema = v.pipe(
    v.strictObject({
        /** Only alerts in these states; omit or empty for every state. */
        statuses: v.optional(v.array(v.picklist(PRICE_ALERT_STATUS_VALUES))),
        /** Only alerts on this market. */
        symbolId: v.optional(SymbolIdInputSchema),
        /** Page size: default 50, at most 200. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))),
        /** Previous `nextPageToken`; reuse only with the same filters. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ statuses, ...input }) => ({
        ...input,
        statuses: statuses?.map((status) => PriceAlertStatusCodec.inputToProto[status]),
    })),
);

export type ListPriceAlertsInput = v.InferInput<typeof ListPriceAlertsInputSchema>;

type PriceAlertPatch = {
    direction?: PriceAlertDirection;
    price?: bigint;
    channels?: number[];
};

const PRICE_ALERT_PATCH_FIELDS = defineProtoPatchFields<PriceAlertPatch>()({
    direction: {
        path: "direction",
        encode: (direction) => ({ direction: PriceAlertDirectionCodec.inputToProto[direction] }),
    },
    price: { path: "price_ticks", encode: (priceTicks) => ({ priceTicks }) },
    channels: { path: "channels", encode: (channels) => ({ channels }) },
});

export const UpdatePriceAlertInputSchema = v.pipe(
    v.strictObject({
        alertId: AlertIdInputSchema,
        /** The alert's `revision` from the last read. */
        expectedRevision: v.pipe(
            positiveBigintStringInputSchema("expectedRevision"),
            v.maxValue(PROTOBUF_UINT64_MAX, "expectedRevision exceeds the uint64 range"),
        ),
        direction: v.optional(v.picklist(PRICE_ALERT_DIRECTION_VALUES)),
        price: v.optional(priceInputSchema("price")),
        channels: v.optional(ChannelsInputSchema),
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.transform(({ alertId, expectedRevision, idempotencyKey, ...fields }) => {
        const { patch: update, updateMask } = buildProtoPatch(fields, PRICE_ALERT_PATCH_FIELDS);
        return { alertId, expectedRevision, idempotencyKey, update, updateMask };
    }),
);

export type UpdatePriceAlertInput = v.InferInput<typeof UpdatePriceAlertInputSchema>;

export const CancelPriceAlertInputSchema = v.strictObject({ alertId: AlertIdInputSchema });

export type CancelPriceAlertInput = v.InferInput<typeof CancelPriceAlertInputSchema>;

const PriceSchema = v.pipe(
    v.bigint(),
    v.transform((ticks) => scaledToDecimalOutput(ticks, PRICE_SCALE)),
);

/** A price alert of the caller's root account. Prices are decimal strings. */
export const PriceAlertSchema = v.pipe(
    v.object({
        alertId: PublicIdSchema,
        symbolId: v.number(),
        direction: enumLabelSchema(PriceAlertDirectionCodec.protoToOutput),
        priceSource: enumLabelSchema(PriceAlertPriceSourceCodec.protoToOutput),
        priceTicks: PriceSchema,
        referencePriceTicks: PriceSchema,
        armed: v.boolean(),
        status: enumLabelSchema(PriceAlertStatusCodec.protoToOutput),
        channels: v.array(enumLabelSchema(PriceAlertChannelCodec.protoToOutput)),
        revision: BigIntStringSchema,
        createdAt: OptionalTimestampMsSchema,
        updatedAt: OptionalTimestampMsSchema,
        triggeredAt: OptionalTimestampMsSchema,
        triggeredPriceTicks: v.bigint(),
    }),
    v.transform((alert) => ({
        alertId: alert.alertId,
        symbolId: alert.symbolId,
        direction: alert.direction,
        priceSource: alert.priceSource,
        /** Alert price. */
        price: alert.priceTicks,
        /** Price when the alert was created or last set again; it fires on a crossing from here. */
        referencePrice: alert.referencePriceTicks,
        /** False while an alert created past its price waits for the price to move back first. */
        armed: alert.armed,
        status: alert.status,
        channels: alert.channels,
        /** Pass as `expectedRevision` to `update`. */
        revision: alert.revision,
        createdAt: alert.createdAt ?? null,
        updatedAt: alert.updatedAt ?? null,
        /** Set only once the alert fired. */
        triggeredAt: alert.triggeredAt ?? null,
        /** Price that fired the alert; null unless it fired. */
        triggeredPrice:
            alert.status === "triggered"
                ? scaledToDecimalOutput(alert.triggeredPriceTicks, PRICE_SCALE)
                : null,
    })),
);

export type PriceAlert = v.InferOutput<typeof PriceAlertSchema>;

export const ListPriceAlertsResultSchema = v.object({
    alerts: v.array(PriceAlertSchema),
    nextPageToken: v.optional(v.string(), ""),
});

/** One page of alerts, newest first; an empty `nextPageToken` means no more. */
export type ListPriceAlertsResult = v.InferOutput<typeof ListPriceAlertsResultSchema>;

export const UpdatePriceAlertResultSchema = v.object({
    alert: PriceAlertSchema,
    outcome: enumLabelSchema(PriceAlertUpdateOutcomeCodec.protoToOutput),
});

export type UpdatePriceAlertResult = v.InferOutput<typeof UpdatePriceAlertResultSchema>;
