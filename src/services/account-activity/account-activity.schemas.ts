import * as v from "valibot";
import { idInputSchema, optionalIdInputSchema } from "../../shared/schemas.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    ACTIVITY_ENTITY_KIND_VALUES,
    ACTIVITY_EVENT_ACTION_VALUES,
    ACTIVITY_EVENT_SOURCE_VALUES,
    ActivityEntityKindCodec,
    ActivityEventActionCodec,
    ActivityEventSourceCodec,
} from "../subaccounts/subaccounts.codecs.js";
import { SubaccountActivityEventSchema } from "../subaccounts/subaccounts.schemas.js";

const TimestampMsInputSchema = v.optional(
    v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(Number.MAX_SAFE_INTEGER),
        v.transform(msToTimestamp),
    ),
);

/**
 * Every filter narrows the list; an omitted or empty filter matches every event the caller may
 * read. Times are epoch milliseconds: `startTime` inclusive, `endTime` exclusive.
 */
export const ListAccountActivityInputSchema = v.pipe(
    v.strictObject({
        /**
         * Sub-accounts to include. With neither this nor `includeMainAccount`, the list covers
         * the main account and every sub-account the caller may read.
         */
        subaccountIds: v.optional(v.array(idInputSchema("subaccountIds"))),
        /** Include the main account's own events, those of no sub-account. */
        includeMainAccount: v.optional(v.boolean()),
        entityKinds: v.optional(v.array(v.picklist(ACTIVITY_ENTITY_KIND_VALUES))),
        eventActions: v.optional(v.array(v.picklist(ACTIVITY_EVENT_ACTION_VALUES))),
        sources: v.optional(v.array(v.picklist(ACTIVITY_EVENT_SOURCE_VALUES))),
        /** Only events performed with this API key. */
        apiKeyId: optionalIdInputSchema("apiKeyId"),
        startTime: TimestampMsInputSchema,
        endTime: TimestampMsInputSchema,
        /** Page size: default 50, at most 200. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))),
        /** Previous `nextPageToken`; reuse only with the same filters. */
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ entityKinds, eventActions, sources, ...input }) => ({
        ...input,
        entityKinds: entityKinds?.map((kind) => ActivityEntityKindCodec.inputToProto[kind]),
        eventActions: eventActions?.map((action) => ActivityEventActionCodec.inputToProto[action]),
        sources: sources?.map((source) => ActivityEventSourceCodec.inputToProto[source]),
    })),
);

export type ListAccountActivityInput = v.InferInput<typeof ListAccountActivityInputSchema>;

export const ListAccountActivityResultSchema = v.object({
    events: v.optional(v.array(SubaccountActivityEventSchema), []),
    nextPageToken: v.optional(v.string(), ""),
});

/** One page of events, newest first; an empty `nextPageToken` means no more. */
export type ListAccountActivityResult = v.InferOutput<typeof ListAccountActivityResultSchema>;

/** A security or activity event of the main account or one of its sub-accounts. */
export type AccountActivityEvent = ListAccountActivityResult["events"][number];
