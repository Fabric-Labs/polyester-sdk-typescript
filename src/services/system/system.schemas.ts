import * as v from "valibot";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import { OptionalTimestampMsSchema, PublicIdSchema } from "../../shared/schemas.js";
import {
    STATUS_EVENT_KIND_VALUES,
    STATUS_EVENT_STATE_VALUES,
    StatusEventImpactCodec,
    StatusEventKindCodec,
    StatusEventServiceCodec,
    StatusEventStateCodec,
} from "./system.codecs.js";

export const ListStatusEventsInputSchema = v.pipe(
    v.strictObject({
        /** States to include; omit or empty for current and upcoming (`scheduled`, `in_progress`). */
        states: v.optional(v.array(v.picklist(STATUS_EVENT_STATE_VALUES))),
        /** Kinds to include; omit or empty for both. */
        kinds: v.optional(v.array(v.picklist(STATUS_EVENT_KIND_VALUES))),
        /** Page size: default 50, at most 200. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))),
        /** Previous `nextPageToken`; resend the same `states` and `kinds` with it. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ states, kinds, ...input }) => ({
        ...input,
        states: states?.map((state) => StatusEventStateCodec.inputToProto[state]),
        kinds: kinds?.map((kind) => StatusEventKindCodec.inputToProto[kind]),
    })),
);

export type ListStatusEventsInput = v.InferInput<typeof ListStatusEventsInputSchema>;

const StatusEventUpdateSchema = v.object({
    /** Position on its event: 1 for the first note, then increasing by 1. */
    id: v.number(),
    message: v.string(),
    createdAt: OptionalTimestampMsSchema,
});

/** One scheduled maintenance or incident. Times are epoch milliseconds. */
export const StatusEventSchema = v.pipe(
    v.object({
        id: PublicIdSchema,
        kind: enumLabelSchema(StatusEventKindCodec.protoToOutput),
        state: enumLabelSchema(StatusEventStateCodec.protoToOutput),
        title: v.string(),
        message: v.string(),
        startTime: OptionalTimestampMsSchema,
        endTime: OptionalTimestampMsSchema,
        services: v.array(enumLabelSchema(StatusEventServiceCodec.protoToOutput)),
        markets: v.array(v.string()),
        updatedAt: OptionalTimestampMsSchema,
        impact: enumLabelSchema(StatusEventImpactCodec.protoToOutput),
        assets: v.array(v.string()),
        cancelledAt: OptionalTimestampMsSchema,
        updates: v.array(StatusEventUpdateSchema),
        detailsUrl: v.optional(v.string()),
    }),
    v.transform((event) => ({
        /** Stable across updates; match events across pages by it. */
        id: event.id,
        kind: event.kind,
        state: event.state,
        title: event.title,
        message: event.message,
        startTime: event.startTime ?? null,
        /** Always set for maintenance; null for an incident with no expected end yet. */
        endTime: event.endTime ?? null,
        services: event.services,
        /** Affected market symbols such as `"BTC-USDT"`; empty when not limited to markets. */
        markets: event.markets,
        /** Affected asset codes such as `"SOL"`; empty when not limited to assets. */
        assets: event.assets,
        /** Incident severity; null for maintenance and an incident not yet assessed. */
        impact: event.impact === "unspecified" ? null : event.impact,
        updatedAt: event.updatedAt ?? null,
        /** Set only when `state` is `"canceled"`. */
        canceledAt: event.cancelledAt ?? null,
        /** Progress notes, oldest first. */
        updates: event.updates.map((update) => ({
            ...update,
            createdAt: update.createdAt ?? null,
        })),
        /** HTTPS link to a long-form announcement; null when there is none. */
        detailsUrl: event.detailsUrl ?? null,
    })),
);

export type StatusEvent = v.InferOutput<typeof StatusEventSchema>;

export const ListStatusEventsResultSchema = v.object({
    events: v.array(StatusEventSchema),
    nextPageToken: v.optional(v.string(), ""),
});

/** One page of events, latest start first; an empty `nextPageToken` means no more. */
export type ListStatusEventsResult = v.InferOutput<typeof ListStatusEventsResultSchema>;
