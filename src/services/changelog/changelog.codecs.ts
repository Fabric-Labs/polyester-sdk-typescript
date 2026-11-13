import * as Proto from "../../gen/changelog/v1/changelog_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const CHANGELOG_CHANGE_CATEGORY_VALUES = [
    "breaking_change",
    "new_feature",
    "improvement",
    "bug_fix",
] as const;
export type ChangelogChangeCategory = (typeof CHANGELOG_CHANGE_CATEGORY_VALUES)[number];

export const CHANGELOG_AUDIENCE_VALUES = [
    "all_users",
    "traders",
    "market_makers",
    "developers",
] as const;
export type ChangelogAudience = (typeof CHANGELOG_AUDIENCE_VALUES)[number];

export const CHANGELOG_SURFACE_VALUES = [
    "trading",
    "funding",
    "accounts",
    "api",
    "explorer",
    "documentation",
    "platform",
    "market_data",
    "quickswap",
    "rewards",
    "assistant",
] as const;
export type ChangelogSurface = (typeof CHANGELOG_SURFACE_VALUES)[number];

export const CHANGELOG_ENVIRONMENT_VALUES = ["devnet", "testnet", "mainnet"] as const;
export type ChangelogEnvironment = (typeof CHANGELOG_ENVIRONMENT_VALUES)[number];

/**
 * How one change differs from its release in an environment: `ahead` is available while the
 * release is pending, `pending` is not yet available though the release is live, and
 * `unavailable` is not available for now either way.
 */
export const CHANGELOG_CHANGE_AVAILABILITY_VALUES = ["ahead", "pending", "unavailable"] as const;
export type ChangelogChangeAvailability = (typeof CHANGELOG_CHANGE_AVAILABILITY_VALUES)[number];

export const CHANGELOG_SORT_VALUES = ["asc", "desc"] as const;
export type ChangelogSort = (typeof CHANGELOG_SORT_VALUES)[number];

export const ChangelogChangeCategoryCodec = {
    inputToProto: {
        breaking_change: Proto.ChangeCategory.BREAKING_CHANGE,
        new_feature: Proto.ChangeCategory.NEW_FEATURE,
        improvement: Proto.ChangeCategory.IMPROVEMENT,
        bug_fix: Proto.ChangeCategory.BUG_FIX,
    } satisfies InputToProto<ChangelogChangeCategory, Proto.ChangeCategory>,
    protoToOutput: {
        [Proto.ChangeCategory.CATEGORY_UNSPECIFIED]: "unspecified",
        [Proto.ChangeCategory.BREAKING_CHANGE]: "breaking_change",
        [Proto.ChangeCategory.NEW_FEATURE]: "new_feature",
        [Proto.ChangeCategory.IMPROVEMENT]: "improvement",
        [Proto.ChangeCategory.BUG_FIX]: "bug_fix",
    } satisfies ProtoToOutput<Proto.ChangeCategory, ChangelogChangeCategory>,
} as const;

export const ChangelogAudienceCodec = {
    inputToProto: {
        all_users: Proto.Audience.ALL_USERS,
        traders: Proto.Audience.TRADERS,
        market_makers: Proto.Audience.MARKET_MAKERS,
        developers: Proto.Audience.DEVELOPERS,
    } satisfies InputToProto<ChangelogAudience, Proto.Audience>,
    protoToOutput: {
        [Proto.Audience.AUDIENCE_UNSPECIFIED]: "unspecified",
        [Proto.Audience.ALL_USERS]: "all_users",
        [Proto.Audience.TRADERS]: "traders",
        [Proto.Audience.MARKET_MAKERS]: "market_makers",
        [Proto.Audience.DEVELOPERS]: "developers",
    } satisfies ProtoToOutput<Proto.Audience, ChangelogAudience>,
} as const;

export const ChangelogSurfaceCodec = {
    inputToProto: {
        trading: Proto.Surface.TRADING,
        funding: Proto.Surface.FUNDING,
        accounts: Proto.Surface.ACCOUNTS,
        api: Proto.Surface.API,
        explorer: Proto.Surface.EXPLORER,
        documentation: Proto.Surface.DOCUMENTATION,
        platform: Proto.Surface.PLATFORM,
        market_data: Proto.Surface.MARKET_DATA,
        quickswap: Proto.Surface.QUICKSWAP,
        rewards: Proto.Surface.REWARDS,
        assistant: Proto.Surface.ASSISTANT,
    } satisfies InputToProto<ChangelogSurface, Proto.Surface>,
    protoToOutput: {
        [Proto.Surface.SURFACE_UNSPECIFIED]: "unspecified",
        [Proto.Surface.TRADING]: "trading",
        [Proto.Surface.FUNDING]: "funding",
        [Proto.Surface.ACCOUNTS]: "accounts",
        [Proto.Surface.API]: "api",
        [Proto.Surface.EXPLORER]: "explorer",
        [Proto.Surface.DOCUMENTATION]: "documentation",
        [Proto.Surface.PLATFORM]: "platform",
        [Proto.Surface.MARKET_DATA]: "market_data",
        [Proto.Surface.QUICKSWAP]: "quickswap",
        [Proto.Surface.REWARDS]: "rewards",
        [Proto.Surface.ASSISTANT]: "assistant",
    } satisfies ProtoToOutput<Proto.Surface, ChangelogSurface>,
} as const;

export const ChangelogSortCodec = {
    inputToProto: {
        asc: Proto.SortDirection.SORT_ASC,
        desc: Proto.SortDirection.SORT_DESC,
    } satisfies InputToProto<ChangelogSort, Proto.SortDirection>,
} as const;

export const ChangelogEnvironmentCodec = {
    protoToOutput: {
        [Proto.Environment.ENVIRONMENT_UNSPECIFIED]: "unspecified",
        [Proto.Environment.DEVNET]: "devnet",
        [Proto.Environment.TESTNET]: "testnet",
        [Proto.Environment.MAINNET]: "mainnet",
    } satisfies ProtoToOutput<Proto.Environment, ChangelogEnvironment>,
} as const;

export const ChangelogChangeAvailabilityCodec = {
    protoToOutput: {
        [Proto.ChangeAvailability.AVAILABILITY_UNSPECIFIED]: "unspecified",
        [Proto.ChangeAvailability.AHEAD]: "ahead",
        [Proto.ChangeAvailability.PENDING]: "pending",
        [Proto.ChangeAvailability.UNAVAILABLE]: "unavailable",
    } satisfies ProtoToOutput<Proto.ChangeAvailability, ChangelogChangeAvailability>,
} as const;
