import * as v from "valibot";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    OptionalTimestampMsSchema,
    PublicIdSchema,
    TimestampMsSchema,
} from "../../shared/schemas.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    CHANGELOG_AUDIENCE_VALUES,
    CHANGELOG_CHANGE_CATEGORY_VALUES,
    CHANGELOG_SORT_VALUES,
    CHANGELOG_SURFACE_VALUES,
    ChangelogAudienceCodec,
    ChangelogChangeCategoryCodec,
    ChangelogSortCodec,
    ChangelogSurfaceCodec,
} from "./changelog.codecs.js";

const PageTokenInputSchema = v.optional(v.pipe(v.string(), v.trim()), "");
const SlugInputSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const TimestampMsInputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(Number.MAX_SAFE_INTEGER),
);

/** `limit` is 0 through 100; 0 or omitted uses the server default of 20. */
export const ListChangelogPostsInputSchema = v.strictObject({
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 0),
    pageToken: PageTokenInputSchema,
});

export type ListChangelogPostsInput = v.InferInput<typeof ListChangelogPostsInputSchema>;

export const GetChangelogPostInputSchema = v.strictObject({
    slug: SlugInputSchema,
});

export type GetChangelogPostInput = v.InferInput<typeof GetChangelogPostInputSchema>;

/**
 * Filters on different fields combine with AND; values within one field combine with OR.
 * Times are epoch milliseconds on post publication time: `startTime` inclusive, `endTime`
 * exclusive and after `startTime`. `limit` is 0 through 500; 0 or omitted uses the server
 * default of 100.
 */
export const ListChangelogChangesInputSchema = v.pipe(
    v.strictObject({
        categories: v.optional(v.array(v.picklist(CHANGELOG_CHANGE_CATEGORY_VALUES)), []),
        actionRequired: v.optional(v.boolean()),
        surfaces: v.optional(v.array(v.picklist(CHANGELOG_SURFACE_VALUES)), []),
        audiences: v.optional(v.array(v.picklist(CHANGELOG_AUDIENCE_VALUES)), []),
        startTime: v.optional(TimestampMsInputSchema),
        endTime: v.optional(TimestampMsInputSchema),
        postSlug: v.optional(v.pipe(v.string(), v.trim()), ""),
        sort: v.optional(v.picklist(CHANGELOG_SORT_VALUES)),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(500)), 0),
        pageToken: PageTokenInputSchema,
    }),
    v.check(
        ({ startTime, endTime }) =>
            startTime === undefined || endTime === undefined || endTime > startTime,
        "endTime: must be after startTime",
    ),
    v.transform(({ categories, surfaces, audiences, startTime, endTime, sort, ...rest }) => ({
        ...rest,
        categories: categories.map((value) => ChangelogChangeCategoryCodec.inputToProto[value]),
        surfaces: surfaces.map((value) => ChangelogSurfaceCodec.inputToProto[value]),
        audiences: audiences.map((value) => ChangelogAudienceCodec.inputToProto[value]),
        startTime: startTime === undefined ? undefined : msToTimestamp(startTime),
        endTime: endTime === undefined ? undefined : msToTimestamp(endTime),
        sort: sort === undefined ? undefined : ChangelogSortCodec.inputToProto[sort],
    })),
);

export type ListChangelogChangesInput = v.InferInput<typeof ListChangelogChangesInputSchema>;

/** `id` is the public base58 identifier, stable across environments. */
export const ChangelogChangeSchema = v.object({
    id: PublicIdSchema,
    title: v.string(),
    summary: v.string(),
    details: v.optional(v.string()),
    category: enumLabelSchema(ChangelogChangeCategoryCodec.protoToOutput),
    actionRequired: v.boolean(),
    migrationGuidance: v.optional(v.string()),
    audiences: v.optional(v.array(enumLabelSchema(ChangelogAudienceCodec.protoToOutput)), []),
    surfaces: v.optional(v.array(enumLabelSchema(ChangelogSurfaceCodec.protoToOutput)), []),
});

export type ChangelogChange = v.InferOutput<typeof ChangelogChangeSchema>;

export const ChangelogSectionSchema = v.object({
    heading: v.string(),
    summary: v.optional(v.string()),
    changes: v.optional(v.array(ChangelogChangeSchema), []),
});

export type ChangelogSection = v.InferOutput<typeof ChangelogSectionSchema>;

/** `coverageCutoff` is the exclusive end of the covered period, `undefined` when unknown. */
export const ChangelogPostSummarySchema = v.object({
    slug: v.string(),
    title: v.string(),
    introduction: v.string(),
    publishedAt: TimestampMsSchema,
    coverageCutoff: OptionalTimestampMsSchema,
    changeCount: v.number(),
    breakingChangeCount: v.number(),
    actionRequiredCount: v.number(),
    newFeatureCount: v.number(),
    improvementCount: v.number(),
    bugFixCount: v.number(),
});

export type ChangelogPostSummary = v.InferOutput<typeof ChangelogPostSummarySchema>;

export const ListChangelogPostsResultSchema = v.object({
    posts: v.optional(v.array(ChangelogPostSummarySchema), []),
    nextPageToken: v.string(),
});

export type ListChangelogPostsResult = v.InferOutput<typeof ListChangelogPostsResultSchema>;

export const ChangelogPostSchema = v.pipe(
    v.object({
        summary: ChangelogPostSummarySchema,
        sections: v.optional(v.array(ChangelogSectionSchema), []),
    }),
    v.transform(({ summary, sections }) => ({ ...summary, sections })),
);

export type ChangelogPost = v.InferOutput<typeof ChangelogPostSchema>;

export const GetChangelogPostResultSchema = v.object({ post: ChangelogPostSchema });

export const ChangelogChangeEntrySchema = v.pipe(
    v.object({
        change: ChangelogChangeSchema,
        postSlug: v.string(),
        publishedAt: TimestampMsSchema,
        sectionHeading: v.string(),
    }),
    v.transform(({ change, ...entry }) => ({ ...change, ...entry })),
);

/** A change with the slug, publication time and section heading of the post that announced it. */
export type ChangelogChangeEntry = v.InferOutput<typeof ChangelogChangeEntrySchema>;

export const ListChangelogChangesResultSchema = v.object({
    changes: v.optional(v.array(ChangelogChangeEntrySchema), []),
    nextPageToken: v.string(),
});

export type ListChangelogChangesResult = v.InferOutput<typeof ListChangelogChangesResultSchema>;
