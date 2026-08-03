import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { SubaccountRole } from "../../gen/auth/v1/subaccounts_pb.js";
import {
    OptionalTimestampMsSchema,
    BigIntStringSchema,
    PublicIdSchema,
    TimestampMsSchema as RequiredTimestampMsSchema,
    idInputSchema,
    optionalSubaccountIdInputSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import {
    ADDRESS_BOOK_ENTRY_KIND_VALUES,
    AccountScopeTypeCodec,
    AddressBookEntryKindCodec,
    DestinationWhitelistStatusCodec,
    InternalWhitelistResolutionStatusCodec,
    TRANSFER_COUNTERPARTY_DIRECTION_VALUES,
    TransferCounterpartyDirectionCodec,
} from "./address-book.codecs.js";
import { SubaccountRoleCodec } from "../subaccounts/subaccounts.codecs.js";
import { buildProtoPatch, defineProtoPatchFields } from "../../utils/proto-patch.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();
const IdSchema = idInputSchema;

const AddressBookLimitSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(500)),
);
const AddressBookCounterpartyLimitSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(200)),
);
const AddressBookViewLimitSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(200)),
);
const PageTokenSchema = v.optional(v.pipe(v.string(), v.trim()), "");

const TimestampMsSchema = OptionalTimestampMsSchema;

const AddressBookTagInputSchema = v.strictObject({
    name: v.pipe(v.string(), v.trim(), v.minLength(1)),
    color: v.optional(v.pipe(v.string(), v.trim()), ""),
});

export const ListAddressBookEntriesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
        limit: AddressBookLimitSchema,
        pageToken: PageTokenSchema,
    }),
    v.transform(({ account, kind, limit, pageToken }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
        limit,
        pageToken,
    })),
);

export type ListAddressBookEntriesInput = v.InferInput<typeof ListAddressBookEntriesInputSchema>;

export const CreateAddressBookEntryInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        label: v.pipe(v.string(), v.trim(), v.minLength(1)),
        note: v.optional(v.pipe(v.string(), v.trim()), ""),
        entry: v.variant("kind", [
            v.strictObject({
                kind: v.literal("external"),
                polychainChainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
                address: v.pipe(v.string(), v.trim(), v.minLength(1)),
            }),
            v.strictObject({
                kind: v.literal("internal"),
                smartAccountAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
            }),
        ]),
        tagIds: v.optional(v.array(IdSchema("tagId")), []),
        newTags: v.optional(v.array(AddressBookTagInputSchema), []),
    }),
    v.transform(({ account, entry, ...rest }) => ({
        ...rest,
        subaccountId: accountScopeToSubaccountId(account),
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
    })),
);

export type CreateAddressBookEntryInput = v.InferInput<typeof CreateAddressBookEntryInputSchema>;

export function validateCreateAddressBookEntryInput(input: CreateAddressBookEntryInput): void {
    v.parse(CreateAddressBookEntryInputSchema, input);
}

type AddressBookEntryPatch = {
    label?: string;
    note?: string;
    tagIds?: bigint[];
};

const ADDRESS_BOOK_ENTRY_PATCH_FIELDS = defineProtoPatchFields<AddressBookEntryPatch>()({
    label: { path: "label", encode: (label) => ({ label }) },
    note: { path: "note", encode: (note) => ({ note }) },
    tagIds: { path: "tag_ids", encode: (tagIds) => ({ tagIds }) },
});

export const UpdateAddressBookEntryInputSchema = v.pipe(
    v.strictObject({
        addressBookEntryId: IdSchema("addressBookEntryId"),
        expectedRevision: positiveBigintStringInputSchema("expectedRevision"),
        label: v.optional(v.pipe(v.string(), v.trim())),
        note: v.optional(v.pipe(v.string(), v.trim())),
        tagIds: v.optional(v.array(IdSchema("tagId"))),
    }),
    v.check(
        ({ label, note, tagIds }) =>
            label !== undefined || note !== undefined || tagIds !== undefined,
        "At least one address-book entry field must be provided",
    ),
    v.transform(({ addressBookEntryId, expectedRevision, ...input }) => {
        const { patch: entry, updateMask } = buildProtoPatch(
            input,
            ADDRESS_BOOK_ENTRY_PATCH_FIELDS,
        );
        return { addressBookEntryId, entry, updateMask, expectedRevision };
    }),
);

export type UpdateAddressBookEntryInput = v.InferInput<typeof UpdateAddressBookEntryInputSchema>;

export const DeleteAddressBookEntryInputSchema = v.strictObject({
    addressBookEntryId: IdSchema("addressBookEntryId"),
});

export type DeleteAddressBookEntryInput = v.InferInput<typeof DeleteAddressBookEntryInputSchema>;

export const CopyAddressBookEntryInputSchema = v.strictObject({
    addressBookEntryId: IdSchema("addressBookEntryId"),
    targetSubaccountId: OptionalSubaccountIdSchema,
});

export type CopyAddressBookEntryInput = v.InferInput<typeof CopyAddressBookEntryInputSchema>;

export const CreateAddressBookTagInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        name: v.pipe(v.string(), v.trim(), v.minLength(1)),
        color: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type CreateAddressBookTagInput = v.InferInput<typeof CreateAddressBookTagInputSchema>;

export const UpdateAddressBookTagInputSchema = v.pipe(
    v.strictObject({
        tagId: IdSchema("tagId"),
        name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
        color: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.check(
        ({ name, color }) => name !== undefined || color !== undefined,
        "At least one address-book tag field must be provided",
    ),
);

export type UpdateAddressBookTagInput = v.InferInput<typeof UpdateAddressBookTagInputSchema>;

export const DeleteAddressBookTagInputSchema = v.strictObject({
    tagId: IdSchema("tagId"),
});

export type DeleteAddressBookTagInput = v.InferInput<typeof DeleteAddressBookTagInputSchema>;

export const ListTransferCounterpartiesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        direction: v.optional(v.picklist(TRANSFER_COUNTERPARTY_DIRECTION_VALUES)),
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
        limit: AddressBookCounterpartyLimitSchema,
    }),
    v.transform(({ account, direction, kind, limit }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        direction: direction
            ? TransferCounterpartyDirectionCodec.inputToProto[direction]
            : undefined,
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
        limit,
    })),
);

export type ListTransferCounterpartiesInput = v.InferInput<
    typeof ListTransferCounterpartiesInputSchema
>;

export const ListTransferDestinationsInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
        limit: AddressBookLimitSchema,
        pageToken: PageTokenSchema,
    }),
    v.transform(({ account, kind, limit, pageToken }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
        limit,
        pageToken,
    })),
);

export type ListTransferDestinationsInput = v.InferInput<
    typeof ListTransferDestinationsInputSchema
>;

export const SubaccountScopedInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
    }),
    v.transform(({ account }) => ({
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type SubaccountScopedInput = v.InferInput<typeof SubaccountScopedInputSchema>;

export const ListInternalTransferWhitelistEntriesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        limit: AddressBookLimitSchema,
        pageToken: PageTokenSchema,
    }),
    v.transform(({ account, limit, pageToken }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        limit,
        pageToken,
    })),
);

export type ListInternalTransferWhitelistEntriesInput = v.InferInput<
    typeof ListInternalTransferWhitelistEntriesInputSchema
>;

export const GetAddressBookViewInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        limit: AddressBookViewLimitSchema,
    }),
    v.transform(({ account, limit }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        limit,
    })),
);

export type GetAddressBookViewInput = v.InferInput<typeof GetAddressBookViewInputSchema>;

const CountSchema = v.pipe(
    v.bigint(),
    v.transform((value) => Number(value)),
);

const AccountScopeSchema = v.object({
    scopeType: v.pipe(
        v.enum(Proto.AccountScopeType),
        v.transform((value) =>
            requiredEnumLabel(
                AccountScopeTypeCodec.protoToOutput,
                value,
                "PolyesterClient.AccountScopeSchema",
                "scope type",
            ),
        ),
    ),
    rootAccountId: PublicIdSchema,
    subaccountId: PublicIdSchema,
});

const ExternalWithdrawAddressSchema = v.object({
    polychainChainId: v.pipe(v.number(), v.integer()),
    address: v.string(),
});

const InternalTransferAccountSchema = v.object({
    rootAccountId: PublicIdSchema,
    targetAccountId: PublicIdSchema,
    targetScopeType: v.pipe(
        v.enum(Proto.AccountScopeType),
        v.transform((value) =>
            requiredEnumLabel(
                AccountScopeTypeCodec.protoToOutput,
                value,
                "PolyesterClient.InternalTransferAccountSchema",
                "target scope type",
            ),
        ),
    ),
    smartAccountAddress: v.string(),
    rootUsername: v.string(),
    subaccountLabel: v.string(),
});

const AddressBookEntryValueSchema = v.variant("case", [
    v.object({ case: v.literal("external"), value: ExternalWithdrawAddressSchema }),
    v.object({ case: v.literal("internal"), value: InternalTransferAccountSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const DestinationWhitelistStatusSchema = v.pipe(
    v.enum(Proto.DestinationWhitelistStatus),
    v.transform((value) =>
        requiredEnumLabel(
            DestinationWhitelistStatusCodec.protoToOutput,
            value,
            "PolyesterClient.DestinationWhitelistStatusSchema",
            "whitelist status",
        ),
    ),
);

const AddressBookEntryKindSchema = v.pipe(
    v.enum(Proto.AddressBookEntryKind),
    v.transform((value) =>
        requiredEnumLabel(
            AddressBookEntryKindCodec.protoToOutput,
            value,
            "PolyesterClient.AddressBookEntryKindSchema",
            "entry kind",
        ),
    ),
);

const TransferCounterpartyDirectionSchema = v.pipe(
    v.enum(Proto.TransferCounterpartyDirection),
    v.transform((value) =>
        requiredEnumLabel(
            TransferCounterpartyDirectionCodec.protoToOutput,
            value,
            "PolyesterClient.TransferCounterpartyDirectionSchema",
            "direction",
        ),
    ),
);

export const AddressBookSchema = v.object({
    scope: v.optional(AccountScopeSchema),
    callerRole: v.pipe(
        v.enum(SubaccountRole),
        v.transform((role) =>
            requiredEnumLabel(
                SubaccountRoleCodec.protoToOutput,
                role,
                "AddressBookEntrySchema",
                "caller role",
            ),
        ),
    ),
    label: v.string(),
    ownerUsername: v.string(),
    smartAccountAddress: v.string(),
});

export type AddressBook = v.InferOutput<typeof AddressBookSchema>;

export const AddressBookTagSummarySchema = v.object({
    tagId: PublicIdSchema,
    name: v.string(),
    color: v.string(),
});

export type AddressBookTagSummary = v.InferOutput<typeof AddressBookTagSummarySchema>;

export const AddressBookTagSchema = v.object({
    tagId: PublicIdSchema,
    scope: v.optional(AccountScopeSchema),
    name: v.string(),
    color: v.string(),
    createdAt: TimestampMsSchema,
    updatedAt: TimestampMsSchema,
});

export type AddressBookTag = v.InferOutput<typeof AddressBookTagSchema>;

export const AddressBookEntrySchema = v.object({
    addressBookEntryId: PublicIdSchema,
    scope: v.optional(AccountScopeSchema),
    kind: AddressBookEntryKindSchema,
    label: v.string(),
    note: v.string(),
    createdAt: TimestampMsSchema,
    updatedAt: TimestampMsSchema,
    entry: AddressBookEntryValueSchema,
    tags: v.array(AddressBookTagSchema),
    revision: BigIntStringSchema,
});

export type AddressBookEntry = v.InferOutput<typeof AddressBookEntrySchema>;

export const AddressBookEntriesSchema = v.array(AddressBookEntrySchema);
export type AddressBookEntries = v.InferOutput<typeof AddressBookEntriesSchema>;

export const TransferCounterpartySchema = v.object({
    counterpartyId: PublicIdSchema,
    scope: v.optional(AccountScopeSchema),
    direction: TransferCounterpartyDirectionSchema,
    kind: AddressBookEntryKindSchema,
    saved: v.boolean(),
    addressBookEntryId: PublicIdSchema,
    useCount: CountSchema,
    firstSeenAt: TimestampMsSchema,
    lastSeenAt: TimestampMsSchema,
    counterparty: AddressBookEntryValueSchema,
});

export type TransferCounterparty = v.InferOutput<typeof TransferCounterpartySchema>;

export const TransferCounterpartiesSchema = v.array(TransferCounterpartySchema);
export type TransferCounterparties = v.InferOutput<typeof TransferCounterpartiesSchema>;

export const TransferDestinationSchema = v.object({
    scope: v.optional(AccountScopeSchema),
    kind: AddressBookEntryKindSchema,
    saved: v.boolean(),
    whitelisted: v.boolean(),
    whitelistStatus: DestinationWhitelistStatusSchema,
    addressBookEntry: v.optional(AddressBookEntrySchema),
    destination: AddressBookEntryValueSchema,
    whitelistEffectiveAt: TimestampMsSchema,
    whitelistUpdatedAt: TimestampMsSchema,
});

export type TransferDestination = v.InferOutput<typeof TransferDestinationSchema>;

export const TransferDestinationsSchema = v.array(TransferDestinationSchema);
export type TransferDestinations = v.InferOutput<typeof TransferDestinationsSchema>;

export const InternalTransferWhitelistEntrySchema = v.object({
    entryId: PublicIdSchema,
    scope: v.optional(AccountScopeSchema),
    rootAccountId: PublicIdSchema,
    targetAccountId: PublicIdSchema,
    targetScopeType: v.pipe(
        v.enum(Proto.AccountScopeType),
        v.transform((value) =>
            requiredEnumLabel(
                AccountScopeTypeCodec.protoToOutput,
                value,
                "PolyesterClient.InternalTransferWhitelistEntrySchema",
                "target scope type",
            ),
        ),
    ),
    smartAccountAddress: v.string(),
    rootUsername: v.string(),
    subaccountLabel: v.string(),
    createdAt: TimestampMsSchema,
    updatedAt: TimestampMsSchema,
    resolutionStatus: v.pipe(
        v.enum(Proto.InternalWhitelistResolutionStatus),
        v.transform((value) =>
            requiredEnumLabel(
                InternalWhitelistResolutionStatusCodec.protoToOutput,
                value,
                "PolyesterClient.InternalTransferWhitelistEntrySchema",
                "resolution status",
            ),
        ),
    ),
});

export type InternalTransferWhitelistEntry = v.InferOutput<
    typeof InternalTransferWhitelistEntrySchema
>;

export const InternalTransferWhitelistEntriesSchema = v.array(InternalTransferWhitelistEntrySchema);

export type InternalTransferWhitelistEntries = v.InferOutput<
    typeof InternalTransferWhitelistEntriesSchema
>;

export const MirroredWithdrawWhitelistEntrySchema = v.object({
    canonicalAddress: v.string(),
    rawAddressHex: v.string(),
    updatedAt: TimestampMsSchema,
    polychainChainId: v.pipe(v.number(), v.integer()),
});

export type MirroredWithdrawWhitelistEntry = v.InferOutput<
    typeof MirroredWithdrawWhitelistEntrySchema
>;

export const WithdrawWhitelistViewSchema = v.object({
    scope: v.optional(AccountScopeSchema),
    externalWhitelistRequired: v.boolean(),
    internalWhitelistRequired: v.boolean(),
    activeEntries: v.optional(v.array(MirroredWithdrawWhitelistEntrySchema), []),
});

export type WithdrawWhitelistView = v.InferOutput<typeof WithdrawWhitelistViewSchema>;

export const AddressBookEntriesViewSchema = v.object({
    external: v.optional(
        v.array(
            v.object({
                addressBookEntryId: PublicIdSchema,
                scope: v.optional(AccountScopeSchema),
                label: v.string(),
                note: v.string(),
                tagIds: v.optional(v.array(PublicIdSchema), []),
                whitelistStatus: DestinationWhitelistStatusSchema,
                polychainChainId: v.pipe(v.number(), v.integer()),
                address: v.string(),
                createdAt: TimestampMsSchema,
                updatedAt: TimestampMsSchema,
                revision: BigIntStringSchema,
            }),
        ),
        [],
    ),
    internal: v.optional(
        v.array(
            v.object({
                addressBookEntryId: PublicIdSchema,
                scope: v.optional(AccountScopeSchema),
                label: v.string(),
                note: v.string(),
                tagIds: v.optional(v.array(PublicIdSchema), []),
                whitelistStatus: DestinationWhitelistStatusSchema,
                rootAccountId: PublicIdSchema,
                targetAccountId: PublicIdSchema,
                targetScopeType: v.pipe(
                    v.enum(Proto.AccountScopeType),
                    v.transform((value) =>
                        requiredEnumLabel(
                            AccountScopeTypeCodec.protoToOutput,
                            value,
                            "PolyesterClient.AddressBookEntriesViewSchema",
                            "target scope type",
                        ),
                    ),
                ),
                smartAccountAddress: v.string(),
                rootUsername: v.string(),
                subaccountLabel: v.string(),
                createdAt: TimestampMsSchema,
                updatedAt: TimestampMsSchema,
                revision: BigIntStringSchema,
            }),
        ),
        [],
    ),
});

export type AddressBookEntriesView = v.InferOutput<typeof AddressBookEntriesViewSchema>;

export const AddressBookRecentDestinationsViewSchema = v.object({
    external: v.optional(
        v.array(
            v.object({
                scope: v.optional(AccountScopeSchema),
                lastDirection: TransferCounterpartyDirectionSchema,
                saved: v.boolean(),
                addressBookEntryId: PublicIdSchema,
                useCount: CountSchema,
                lastSeenAt: TimestampMsSchema,
                polychainChainId: v.pipe(v.number(), v.integer()),
                address: v.string(),
            }),
        ),
        [],
    ),
    internal: v.optional(
        v.array(
            v.object({
                scope: v.optional(AccountScopeSchema),
                lastDirection: TransferCounterpartyDirectionSchema,
                saved: v.boolean(),
                addressBookEntryId: PublicIdSchema,
                useCount: CountSchema,
                lastSeenAt: TimestampMsSchema,
                rootAccountId: PublicIdSchema,
                targetAccountId: PublicIdSchema,
                targetScopeType: v.pipe(
                    v.enum(Proto.AccountScopeType),
                    v.transform((value) =>
                        requiredEnumLabel(
                            AccountScopeTypeCodec.protoToOutput,
                            value,
                            "PolyesterClient.AddressBookRecentDestinationsViewSchema",
                            "target scope type",
                        ),
                    ),
                ),
                smartAccountAddress: v.string(),
                rootUsername: v.string(),
                subaccountLabel: v.string(),
            }),
        ),
        [],
    ),
});

export type AddressBookRecentDestinationsView = v.InferOutput<
    typeof AddressBookRecentDestinationsViewSchema
>;

export const AddressBookViewSchema = v.object({
    books: v.optional(v.array(AddressBookSchema), []),
    entries: v.optional(AddressBookEntriesViewSchema),
    recentDestinations: v.optional(AddressBookRecentDestinationsViewSchema),
    tags: v.optional(v.array(AddressBookTagSummarySchema), []),
    withdrawWhitelist: v.optional(WithdrawWhitelistViewSchema),
    recentDestinationsTruncated: v.optional(v.boolean(), false),
});

export type AddressBookView = v.InferOutput<typeof AddressBookViewSchema>;

export const AddressBookViewInvalidatedSchema = v.object({
    scope: v.optional(AccountScopeSchema),
    invalidatedAt: RequiredTimestampMsSchema,
});

export type AddressBookViewInvalidated = v.InferOutput<typeof AddressBookViewInvalidatedSchema>;
