import z from "zod";
import { TimestampSchema } from "../../../shared/schemas";
import { tsObjToMs } from "../../../utils/time";
import { formatId } from "../../../utils/base58-id";

export const ProfileSchema = z.object({
	username: z.string(),
	bio: z.string(),
	website: z.string(),
	twitter: z.string(),
	twitterVerified: z.boolean().default(false),
	discord: z.string(),
	discordVerified: z.boolean().default(false),
	avatarUrl: z.string(),
	createdAt: TimestampSchema.optional().transform((v) => (v ? tsObjToMs(v) : undefined)),
	nextUsernameChangeAt: TimestampSchema.optional().transform((v) =>
		v ? tsObjToMs(v) : undefined
	),
	vipTier: z.number(),
	usernameUnlocked: z.boolean().default(false),
});

export type Profile = z.output<typeof ProfileSchema>;
export const UpdateProfileInputSchema = ProfileSchema.partial();

export const UsernameHistoryEntrySchema = z.object({
	username: z.string(),
	setAt: TimestampSchema.optional().transform((v) => (v ? tsObjToMs(v) : undefined)),
});

export type UsernameHistoryEntry = z.output<typeof UsernameHistoryEntrySchema>;

export const AccountIdentitySchema = z.object({
	accountId: z.bigint().transform(formatId),
	username: z.string().optional(),
	avatarUrl: z.string().optional(),
	rootSmartAccountAddress: z.string(),
});

export type AccountIdentity = z.output<typeof AccountIdentitySchema>;
