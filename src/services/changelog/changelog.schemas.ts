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
    ChangelogChangeAvailabilityCodec,
    ChangelogChangeCategoryCodec,
    ChangelogEnvironmentCodec,
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
 * Times are epoch milliseconds on first post publication time: `startTime` inclusive, `endTime`
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

/** `liveAt` is set for `ahead` only: when the change became available there. */
const ChangelogChangeExceptionSchema = v.object({
    environment: enumLabelSchema(ChangelogEnvironmentCodec.protoToOutput),
    availability: enumLabelSchema(ChangelogChangeAvailabilityCodec.protoToOutput),
    liveAt: OptionalTimestampMsSchema,
});

/** `liveAt` is when the release went live there, `undefined` while it is pending. */
const ChangelogEnvironmentStatusSchema = v.object({
    environment: enumLabelSchema(ChangelogEnvironmentCodec.protoToOutput),
    liveAt: OptionalTimestampMsSchema,
});

/**
 * `id` is the public base58 identifier, stable across environments. `environmentExceptions`
 * lists every environment where the change differs from its release's status; it is empty
 * outside release posts and when the change follows its release everywhere.
 */
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
    environmentExceptions: v.optional(v.array(ChangelogChangeExceptionSchema), []),
});

export type ChangelogChange = v.InferOutput<typeof ChangelogChangeSchema>;

/** `surface` is the product area the section covers, `"unspecified"` when it spans several. */
export const ChangelogSectionSchema = v.object({
    heading: v.string(),
    summary: v.optional(v.string()),
    surface: enumLabelSchema(ChangelogSurfaceCodec.protoToOutput),
    changes: v.optional(v.array(ChangelogChangeSchema), []),
});

export type ChangelogSection = v.InferOutput<typeof ChangelogSectionSchema>;

/**
 * `coverageCutoff` is the exclusive end of the covered period, `undefined` when unknown.
 * A post can be republished to correct its copy or withdraw a change: `revision` starts at 1
 * and increases with each republication, and `updatedAt` is when the current revision was
 * published (equal to `publishedAt` for revision 1). `slug` and `publishedAt` never change.
 * A server that predates post revisions sends `revision` 0 and no `updatedAt`.
 *
 * A release post has `releaseVersion` (for example `"0.92.9"`), the same slug (`"v0.92.9"`) and
 * content in every environment, and is listed even where the release is still pending.
 * `environments` holds the release's status in devnet, testnet and mainnet, in that order, and
 * changes without a new revision. `deploymentGroupSlug` names the deployment group that brought
 * the release here, `undefined` while it is pending here. Posts that announce no single release
 * have no `releaseVersion`, no `deploymentGroupSlug` and empty `environments`.
 */
export const ChangelogPostSummarySchema = v.object({
    slug: v.string(),
    title: v.string(),
    introduction: v.string(),
    publishedAt: TimestampMsSchema,
    updatedAt: OptionalTimestampMsSchema,
    revision: v.number(),
    coverageCutoff: OptionalTimestampMsSchema,
    changeCount: v.number(),
    breakingChangeCount: v.number(),
    actionRequiredCount: v.number(),
    newFeatureCount: v.number(),
    improvementCount: v.number(),
    bugFixCount: v.number(),
    releaseVersion: v.optional(v.string()),
    environments: v.optional(v.array(ChangelogEnvironmentStatusSchema), []),
    deploymentGroupSlug: v.optional(v.string()),
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

/** A change with the slug, first publication time and section heading of the post that announced it. */
export type ChangelogChangeEntry = v.InferOutput<typeof ChangelogChangeEntrySchema>;

export const ListChangelogChangesResultSchema = v.object({
    changes: v.optional(v.array(ChangelogChangeEntrySchema), []),
    nextPageToken: v.string(),
});

export type ListChangelogChangesResult = v.InferOutput<typeof ListChangelogChangesResultSchema>;

/** `limit` is 0 through 100; 0 or omitted uses the server default of 20. */
export const ListChangelogDeploymentGroupsInputSchema = v.strictObject({
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 0),
    pageToken: PageTokenInputSchema,
});

export type ListChangelogDeploymentGroupsInput = v.InferInput<
    typeof ListChangelogDeploymentGroupsInputSchema
>;

export const GetChangelogDeploymentGroupInputSchema = v.strictObject({
    slug: SlugInputSchema,
});

export type GetChangelogDeploymentGroupInput = v.InferInput<
    typeof GetChangelogDeploymentGroupInputSchema
>;

/** A published release post a deployment group brought. */
const ChangelogDeploymentGroupPostSchema = v.object({
    slug: v.string(),
    releaseVersion: v.string(),
    title: v.string(),
    publishedAt: TimestampMsSchema,
    revision: v.number(),
    updatedAt: OptionalTimestampMsSchema,
});

/**
 * One deployment to this environment that raised its release version. `slug` is the environment
 * and the group's own release, for example `"testnet-v0.92.9"`, and never changes. `versions`
 * lists every release the group brought, ascending; `posts` holds the published release posts of
 * those releases, so a release without a post has none. `previousReleaseVersion` is `undefined`
 * for the first group, and `releaseTag` when unknown.
 */
export const ChangelogDeploymentGroupSummarySchema = v.object({
    slug: v.string(),
    environment: enumLabelSchema(ChangelogEnvironmentCodec.protoToOutput),
    occurredAt: TimestampMsSchema,
    releaseVersion: v.string(),
    releaseTag: v.optional(v.string()),
    previousReleaseVersion: v.optional(v.string()),
    versions: v.optional(v.array(v.string()), []),
    posts: v.optional(v.array(ChangelogDeploymentGroupPostSchema), []),
});

export type ChangelogDeploymentGroupSummary = v.InferOutput<
    typeof ChangelogDeploymentGroupSummarySchema
>;

export const ListChangelogDeploymentGroupsResultSchema = v.object({
    groups: v.optional(v.array(ChangelogDeploymentGroupSummarySchema), []),
    nextPageToken: v.string(),
});

export type ListChangelogDeploymentGroupsResult = v.InferOutput<
    typeof ListChangelogDeploymentGroupsResultSchema
>;

const ChangelogDeploymentGroupAttentionSchema = v.pipe(
    v.object({
        change: ChangelogChangeSchema,
        postSlug: v.string(),
        releaseVersion: v.string(),
    }),
    v.transform(({ change, ...entry }) => ({ ...change, ...entry })),
);

const ChangelogDeploymentGroupHighlightSchema = v.object({
    postSlug: v.string(),
    releaseVersion: v.string(),
    /** Inline Markdown. */
    text: v.string(),
});

/**
 * A deployment group with `attention`, its breaking and action-required changes, and the
 * `highlights` of its release posts, both in ascending release order.
 */
export const ChangelogDeploymentGroupSchema = v.pipe(
    v.object({
        summary: ChangelogDeploymentGroupSummarySchema,
        attention: v.optional(v.array(ChangelogDeploymentGroupAttentionSchema), []),
        highlights: v.optional(v.array(ChangelogDeploymentGroupHighlightSchema), []),
    }),
    v.transform(({ summary, ...group }) => ({ ...summary, ...group })),
);

export type ChangelogDeploymentGroup = v.InferOutput<typeof ChangelogDeploymentGroupSchema>;

export const GetChangelogDeploymentGroupResultSchema = v.object({
    group: ChangelogDeploymentGroupSchema,
});
