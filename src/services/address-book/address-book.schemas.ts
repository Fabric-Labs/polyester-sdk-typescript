import { z } from "zod";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { SubaccountRole } from "../../gen/auth/v1/subaccounts_pb.js";
import { formatId, idToBigInt } from "../../utils/base58-id.js";
import { tsObjToMs } from "../../utils/time.js";
import { TimestampSchema } from "../../shared/schemas.js";
import {
	ADDRESS_BOOK_ENTRY_KIND_VALUES,
	AccountScopeTypeCodec,
	AddressBookEntryKindCodec,
	DestinationWhitelistStatusCodec,
	InternalWhitelistResolutionStatusCodec,
	TRANSFER_COUNTERPARTY_DIRECTION_VALUES,
	TransferCounterpartyDirectionCodec,
	type AddressBookEntryKindLabel,
	type DestinationWhitelistStatusLabel,
} from "./address-book.codecs.js";
import { SubAccountRoleCodec } from "../sub-accounts/sub-accounts.codecs.js";

const OptionalSubAccountIdSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value ? idToBigInt(value, "subaccountId") : undefined));

const IdSchema = (fieldName: string) =>
	z
		.string()
		.trim()
		.min(1)
		.transform((value) => idToBigInt(value, fieldName));

const PageSizeSchema = z.number().int().positive().max(200).optional();

const TimestampMsSchema = TimestampSchema.optional().transform((value) => tsObjToMs(value));

const AddressBookTagInputSchema = z.object({
	name: z.string().trim().min(1),
	color: z.string().trim().optional().default(""),
});

export const ListAddressBookEntriesInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		kind: z.enum(ADDRESS_BOOK_ENTRY_KIND_VALUES).optional(),
	})
	.transform(({ subAccountId, kind }) => ({
		subaccountId: subAccountId,
		kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
	}));

export type ListAddressBookEntriesInput = z.input<typeof ListAddressBookEntriesInputSchema>;

export const CreateAddressBookEntryInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		label: z.string().trim().min(1),
		note: z.string().trim().optional().default(""),
		entry: z.discriminatedUnion("kind", [
			z.object({
				kind: z.literal("external"),
				polychainChainId: z.number().int().positive(),
				address: z.string().trim().min(1),
			}),
			z.object({
				kind: z.literal("internal"),
				smartAccountAddress: z.string().trim().min(1),
			}),
		]),
		tagIds: z.array(IdSchema("tagId")).optional().default([]),
		newTags: z.array(AddressBookTagInputSchema).optional().default([]),
	})
	.transform(({ subAccountId, entry, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
		entry:
			entry.kind === "external"
				? {
						case: "external" as const,
						value: {
							polychainChainId: entry.polychainChainId,
							address: entry.address,
						},
					}
				: {
						case: "internal" as const,
						value: {
							smartAccountAddress: entry.smartAccountAddress,
						},
					},
	}));

export type CreateAddressBookEntryInput = z.input<typeof CreateAddressBookEntryInputSchema>;

export const UpdateAddressBookEntryInputSchema = z
	.object({
		addressBookEntryId: IdSchema("addressBookEntryId"),
		label: z.string().trim().min(1),
		note: z.string().trim().optional().default(""),
		tagIds: z.array(IdSchema("tagId")).optional().default([]),
		newTags: z.array(AddressBookTagInputSchema).optional().default([]),
	})
	.transform((input) => input);

export type UpdateAddressBookEntryInput = z.input<typeof UpdateAddressBookEntryInputSchema>;

export const DeleteAddressBookEntryInputSchema = z.object({
	addressBookEntryId: IdSchema("addressBookEntryId"),
});

export type DeleteAddressBookEntryInput = z.input<typeof DeleteAddressBookEntryInputSchema>;

export const CopyAddressBookEntryInputSchema = z
	.object({
		addressBookEntryId: IdSchema("addressBookEntryId"),
		targetSubAccountId: OptionalSubAccountIdSchema,
	})
	.transform(({ targetSubAccountId, ...rest }) => ({
		...rest,
		targetSubaccountId: targetSubAccountId,
	}));

export type CopyAddressBookEntryInput = z.input<typeof CopyAddressBookEntryInputSchema>;

export const CreateAddressBookTagInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		name: z.string().trim().min(1),
		color: z.string().trim().optional().default(""),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type CreateAddressBookTagInput = z.input<typeof CreateAddressBookTagInputSchema>;

export const UpdateAddressBookTagInputSchema = z.object({
	tagId: IdSchema("tagId"),
	name: z.string().trim().min(1),
	color: z.string().trim().optional().default(""),
});

export type UpdateAddressBookTagInput = z.input<typeof UpdateAddressBookTagInputSchema>;

export const DeleteAddressBookTagInputSchema = z.object({
	tagId: IdSchema("tagId"),
});

export type DeleteAddressBookTagInput = z.input<typeof DeleteAddressBookTagInputSchema>;

export const ListTransferCounterpartiesInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		direction: z.enum(TRANSFER_COUNTERPARTY_DIRECTION_VALUES).optional(),
		kind: z.enum(ADDRESS_BOOK_ENTRY_KIND_VALUES).optional(),
		pageSize: PageSizeSchema,
	})
	.transform(({ subAccountId, direction, kind, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
		direction: direction
			? TransferCounterpartyDirectionCodec.inputToProto[direction]
			: undefined,
		kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
	}));

export type ListTransferCounterpartiesInput = z.input<typeof ListTransferCounterpartiesInputSchema>;

export const ListTransferDestinationsInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		kind: z.enum(ADDRESS_BOOK_ENTRY_KIND_VALUES).optional(),
	})
	.transform(({ subAccountId, kind }) => ({
		subaccountId: subAccountId,
		kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
	}));

export type ListTransferDestinationsInput = z.input<typeof ListTransferDestinationsInputSchema>;

export const SubAccountScopedInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
	})
	.transform(({ subAccountId }) => ({
		subaccountId: subAccountId,
	}));

export type SubAccountScopedInput = z.input<typeof SubAccountScopedInputSchema>;

export const GetAddressBookViewInputSchema = z
	.object({
		subAccountId: OptionalSubAccountIdSchema,
		pageSize: PageSizeSchema,
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type GetAddressBookViewInput = z.input<typeof GetAddressBookViewInputSchema>;

const PublicIdSchema = z.bigint().transform((value) => formatId(value));
const CountSchema = z.bigint().transform((value) => Number(value));

function requiredLabel<TLabel>(label: TLabel | undefined, schemaName: string): TLabel {
	if (label) return label;
	throw new Error(`[PolyesterClient.${schemaName}]: enum value is missing or unspecified`);
}

const AccountScopeSchema = z
	.object({
		scopeType: z
			.enum(Proto.AccountScopeType)
			.transform((value) =>
				requiredLabel(
					AccountScopeTypeCodec.protoToOutputWithDefault[value],
					"AccountScopeSchema"
				)
			),
		rootAccountId: PublicIdSchema,
		subaccountId: PublicIdSchema,
	})
	.transform(({ subaccountId, ...scope }) => ({
		...scope,
		subAccountId: subaccountId,
	}));

const ExternalWithdrawAddressSchema = z.object({
	polychainChainId: z.number().int(),
	address: z.string(),
});

const InternalTransferAccountSchema = z
	.object({
		rootAccountId: PublicIdSchema,
		targetAccountId: PublicIdSchema,
		targetScopeType: z
			.enum(Proto.AccountScopeType)
			.transform((value) =>
				requiredLabel(
					AccountScopeTypeCodec.protoToOutputWithDefault[value],
					"InternalTransferAccountSchema"
				)
			),
		smartAccountAddress: z.string(),
		rootUsername: z.string(),
		subaccountLabel: z.string(),
	})
	.transform(({ subaccountLabel, ...account }) => ({
		...account,
		subAccountLabel: subaccountLabel,
	}));

const AddressBookEntryValueSchema = z.discriminatedUnion("case", [
	z.object({ case: z.literal("external"), value: ExternalWithdrawAddressSchema }),
	z.object({ case: z.literal("internal"), value: InternalTransferAccountSchema }),
	z.object({ case: z.undefined(), value: z.undefined().optional() }),
]);

const DestinationWhitelistStatusSchema = z
	.enum(Proto.DestinationWhitelistStatus)
	.transform((value) =>
		requiredLabel(
			DestinationWhitelistStatusCodec.protoToOutputWithDefault[value],
			"DestinationWhitelistStatusSchema"
		)
	);

const AddressBookEntryKindSchema = z
	.enum(Proto.AddressBookEntryKind)
	.transform((value) =>
		requiredLabel(
			AddressBookEntryKindCodec.protoToOutputWithDefault[value],
			"AddressBookEntryKindSchema"
		)
	);

const TransferCounterpartyDirectionSchema = z
	.enum(Proto.TransferCounterpartyDirection)
	.transform((value) =>
		requiredLabel(
			TransferCounterpartyDirectionCodec.protoToOutputWithDefault[value],
			"TransferCounterpartyDirectionSchema"
		)
	);

export const AddressBookSchema = z.object({
	scope: AccountScopeSchema.optional(),
	callerRole: z.enum(SubaccountRole).transform((role) => SubAccountRoleCodec.protoToOutput[role]),
	label: z.string(),
	ownerUsername: z.string(),
	smartAccountAddress: z.string(),
});

export type AddressBook = z.output<typeof AddressBookSchema>;

export const AddressBookTagSummarySchema = z.object({
	tagId: PublicIdSchema,
	name: z.string(),
	color: z.string(),
});

export type AddressBookTagSummary = z.output<typeof AddressBookTagSummarySchema>;

export const AddressBookTagSchema = z.object({
	tagId: PublicIdSchema,
	scope: AccountScopeSchema.optional(),
	name: z.string(),
	color: z.string(),
	createdAt: TimestampMsSchema,
	updatedAt: TimestampMsSchema,
});

export type AddressBookTag = z.output<typeof AddressBookTagSchema>;

export const AddressBookEntrySchema = z.object({
	addressBookEntryId: PublicIdSchema,
	scope: AccountScopeSchema.optional(),
	kind: AddressBookEntryKindSchema,
	label: z.string(),
	note: z.string(),
	createdAt: TimestampMsSchema,
	updatedAt: TimestampMsSchema,
	entry: AddressBookEntryValueSchema,
	tags: z.array(AddressBookTagSchema),
});

export type AddressBookEntry = z.output<typeof AddressBookEntrySchema>;

export const AddressBookEntriesSchema = z.array(AddressBookEntrySchema);
export type AddressBookEntries = z.output<typeof AddressBookEntriesSchema>;

export const TransferCounterpartySchema = z.object({
	counterpartyId: PublicIdSchema,
	scope: AccountScopeSchema.optional(),
	direction: TransferCounterpartyDirectionSchema,
	kind: AddressBookEntryKindSchema,
	saved: z.boolean(),
	addressBookEntryId: PublicIdSchema,
	useCount: CountSchema,
	firstSeenAt: TimestampMsSchema,
	lastSeenAt: TimestampMsSchema,
	counterparty: AddressBookEntryValueSchema,
});

export type TransferCounterparty = z.output<typeof TransferCounterpartySchema>;

export const TransferCounterpartiesSchema = z.array(TransferCounterpartySchema);
export type TransferCounterparties = z.output<typeof TransferCounterpartiesSchema>;

export const TransferDestinationSchema = z.object({
	scope: AccountScopeSchema.optional(),
	kind: AddressBookEntryKindSchema,
	saved: z.boolean(),
	whitelisted: z.boolean(),
	whitelistStatus: DestinationWhitelistStatusSchema,
	addressBookEntry: AddressBookEntrySchema.optional(),
	destination: AddressBookEntryValueSchema,
	whitelistEffectiveAt: TimestampMsSchema,
	whitelistUpdatedAt: TimestampMsSchema,
});

export type TransferDestination = z.output<typeof TransferDestinationSchema>;

export const TransferDestinationsSchema = z.array(TransferDestinationSchema);
export type TransferDestinations = z.output<typeof TransferDestinationsSchema>;

export const InternalTransferWhitelistEntrySchema = z
	.object({
		entryId: PublicIdSchema,
		scope: AccountScopeSchema.optional(),
		rootAccountId: PublicIdSchema,
		targetAccountId: PublicIdSchema,
		targetScopeType: z
			.enum(Proto.AccountScopeType)
			.transform((value) =>
				requiredLabel(
					AccountScopeTypeCodec.protoToOutputWithDefault[value],
					"InternalTransferWhitelistEntrySchema"
				)
			),
		smartAccountAddress: z.string(),
		rootUsername: z.string(),
		subaccountLabel: z.string(),
		createdAt: TimestampMsSchema,
		updatedAt: TimestampMsSchema,
		resolutionStatus: z
			.enum(Proto.InternalWhitelistResolutionStatus)
			.transform((value) =>
				requiredLabel(
					InternalWhitelistResolutionStatusCodec.protoToOutputWithDefault[value],
					"InternalTransferWhitelistEntrySchema"
				)
			),
	})
	.transform(({ subaccountLabel, ...entry }) => ({
		...entry,
		subAccountLabel: subaccountLabel,
	}));

export type InternalTransferWhitelistEntry = z.output<typeof InternalTransferWhitelistEntrySchema>;

export const InternalTransferWhitelistEntriesSchema = z.array(InternalTransferWhitelistEntrySchema);

export type InternalTransferWhitelistEntries = z.output<
	typeof InternalTransferWhitelistEntriesSchema
>;

export const MirroredWithdrawWhitelistEntrySchema = z
	.object({
		canonicalAddress: z.string(),
		rawAddressHex: z.string(),
		updatedAt: TimestampMsSchema,
		polychainChainId: z.number().int(),
	})
	.transform((entry) => entry);

export type MirroredWithdrawWhitelistEntry = z.output<typeof MirroredWithdrawWhitelistEntrySchema>;

export const WithdrawWhitelistViewSchema = z.object({
	scope: AccountScopeSchema.optional(),
	externalWhitelistRequired: z.boolean(),
	internalWhitelistRequired: z.boolean(),
	activeEntries: z.array(MirroredWithdrawWhitelistEntrySchema).default([]),
});

export type WithdrawWhitelistView = z.output<typeof WithdrawWhitelistViewSchema>;

export const AddressBookEntriesViewSchema = z.object({
	external: z
		.array(
			z.object({
				addressBookEntryId: PublicIdSchema,
				scope: AccountScopeSchema.optional(),
				label: z.string(),
				note: z.string(),
				tagIds: z.array(PublicIdSchema).default([]),
				whitelistStatus: DestinationWhitelistStatusSchema,
				polychainChainId: z.number().int(),
				address: z.string(),
				createdAt: TimestampMsSchema,
				updatedAt: TimestampMsSchema,
			})
		)
		.default([]),
	internal: z
		.array(
			z
				.object({
					addressBookEntryId: PublicIdSchema,
					scope: AccountScopeSchema.optional(),
					label: z.string(),
					note: z.string(),
					tagIds: z.array(PublicIdSchema).default([]),
					whitelistStatus: DestinationWhitelistStatusSchema,
					rootAccountId: PublicIdSchema,
					targetAccountId: PublicIdSchema,
					targetScopeType: z
						.enum(Proto.AccountScopeType)
						.transform((value) =>
							requiredLabel(
								AccountScopeTypeCodec.protoToOutputWithDefault[value],
								"AddressBookEntriesViewSchema"
							)
						),
					smartAccountAddress: z.string(),
					rootUsername: z.string(),
					subaccountLabel: z.string(),
					createdAt: TimestampMsSchema,
					updatedAt: TimestampMsSchema,
				})
				.transform(({ subaccountLabel, ...entry }) => ({
					...entry,
					subAccountLabel: subaccountLabel,
				}))
		)
		.default([]),
});

export type AddressBookEntriesView = z.output<typeof AddressBookEntriesViewSchema>;

export const AddressBookRecentDestinationsViewSchema = z.object({
	external: z
		.array(
			z.object({
				scope: AccountScopeSchema.optional(),
				lastDirection: TransferCounterpartyDirectionSchema,
				saved: z.boolean(),
				addressBookEntryId: PublicIdSchema,
				useCount: CountSchema,
				lastSeenAt: TimestampMsSchema,
				polychainChainId: z.number().int(),
				address: z.string(),
			})
		)
		.default([]),
	internal: z
		.array(
			z
				.object({
					scope: AccountScopeSchema.optional(),
					lastDirection: TransferCounterpartyDirectionSchema,
					saved: z.boolean(),
					addressBookEntryId: PublicIdSchema,
					useCount: CountSchema,
					lastSeenAt: TimestampMsSchema,
					rootAccountId: PublicIdSchema,
					targetAccountId: PublicIdSchema,
					targetScopeType: z
						.enum(Proto.AccountScopeType)
						.transform((value) =>
							requiredLabel(
								AccountScopeTypeCodec.protoToOutputWithDefault[value],
								"AddressBookRecentDestinationsViewSchema"
							)
						),
					smartAccountAddress: z.string(),
					rootUsername: z.string(),
					subaccountLabel: z.string(),
				})
				.transform(({ subaccountLabel, ...entry }) => ({
					...entry,
					subAccountLabel: subaccountLabel,
				}))
		)
		.default([]),
});

export type AddressBookRecentDestinationsView = z.output<
	typeof AddressBookRecentDestinationsViewSchema
>;

export const AddressBookViewSchema = z.object({
	books: z.array(AddressBookSchema).default([]),
	entries: AddressBookEntriesViewSchema.optional(),
	recentDestinations: AddressBookRecentDestinationsViewSchema.optional(),
	tags: z.array(AddressBookTagSummarySchema).default([]),
	withdrawWhitelist: WithdrawWhitelistViewSchema.optional(),
});

export type AddressBookView = z.output<typeof AddressBookViewSchema>;

export function kindFromProto(
	kind: Proto.AddressBookEntryKind
): AddressBookEntryKindLabel | undefined {
	return AddressBookEntryKindCodec.protoToOutputWithDefault[kind];
}

export function whitelistStatusFromProto(
	status: Proto.DestinationWhitelistStatus
): DestinationWhitelistStatusLabel | undefined {
	return DestinationWhitelistStatusCodec.protoToOutputWithDefault[status];
}
