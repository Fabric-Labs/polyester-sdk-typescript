import * as v from "../../../shared/validation.js";
import { PublicIdSchema, TimestampSchema } from "../../../shared/schemas.js";
import { tsObjToMs } from "../../../utils/time.js";

export const ProfileSchema = v.object({
    username: v.string(),
    bio: v.string(),
    website: v.string(),
    twitter: v.string(),
    twitterVerified: v.optional(v.boolean(), false),
    discord: v.string(),
    discordVerified: v.optional(v.boolean(), false),
    avatarUrl: v.string(),
    createdAt: v.pipe(
        v.optional(TimestampSchema),
        v.transform((v) => (v ? tsObjToMs(v) : undefined)),
    ),
    nextUsernameChangeAt: v.pipe(
        v.optional(TimestampSchema),
        v.transform((v) => (v ? tsObjToMs(v) : undefined)),
    ),
    vipTier: v.number(),
    usernameUnlocked: v.optional(v.boolean(), false),
});

export type Profile = v.InferOutput<typeof ProfileSchema>;
// Deliberately non-strict: update() accepts a round-tripped Profile
// ({ ...profile, bio }) and strips its readonly fields instead of rejecting.
export const UpdateProfileInputSchema = v.object({
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
});
export type UpdateProfileInput = v.InferInput<typeof UpdateProfileInputSchema>;

export const UsernameHistoryEntrySchema = v.object({
    username: v.string(),
    setAt: v.pipe(
        v.optional(TimestampSchema),
        v.transform((v) => (v ? tsObjToMs(v) : undefined)),
    ),
});

export type UsernameHistoryEntry = v.InferOutput<typeof UsernameHistoryEntrySchema>;

export const AccountIdentitySchema = v.object({
    accountId: PublicIdSchema,
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    rootSmartAccountAddress: v.string(),
});

export type AccountIdentity = v.InferOutput<typeof AccountIdentitySchema>;
