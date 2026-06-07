import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { SubaccountRole } from "../../gen/auth/v1/subaccounts_pb.js";
import {
    OptionalTimestampMsSchema,
    PublicIdSchema,
    idInputSchema,
    optionalSubAccountIdInputSchema,
} from "../../shared/schemas.js";
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

const OptionalSubAccountIdSchema = optionalSubAccountIdInputSchema();
const IdSchema = idInputSchema;

const PageSizeSchema = v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(200)));

const TimestampMsSchema = OptionalTimestampMsSchema;

const AddressBookTagInputSchema = v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1)),
    color: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
});

export const ListAddressBookEntriesInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
    }),
    v.transform(({ subAccountId, kind }) => ({
        subaccountId: subAccountId,
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
    })),
);

export type ListAddressBookEntriesInput = v.InferInput<typeof ListAddressBookEntriesInputSchema>;

export const CreateAddressBookEntryInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        label: v.pipe(v.string(), v.trim(), v.minLength(1)),
        note: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
        entry: v.variant("kind", [
            v.object({
                kind: v.literal("external"),
                polychainChainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
                address: v.pipe(v.string(), v.trim(), v.minLength(1)),
            }),
            v.object({
                kind: v.literal("internal"),
                smartAccountAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
            }),
        ]),
        tagIds: v.optional(v.optional(v.array(IdSchema("tagId"))), []),
        newTags: v.optional(v.optional(v.array(AddressBookTagInputSchema)), []),
    }),
    v.transform(({ subAccountId, entry, ...rest }) => ({
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
    })),
);

export type CreateAddressBookEntryInput = v.InferInput<typeof CreateAddressBookEntryInputSchema>;

export const UpdateAddressBookEntryInputSchema = v.pipe(
    v.object({
        addressBookEntryId: IdSchema("addressBookEntryId"),
        label: v.pipe(v.string(), v.trim(), v.minLength(1)),
        note: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
        tagIds: v.optional(v.optional(v.array(IdSchema("tagId"))), []),
        newTags: v.optional(v.optional(v.array(AddressBookTagInputSchema)), []),
    }),
    v.transform((input) => input),
);

export type UpdateAddressBookEntryInput = v.InferInput<typeof UpdateAddressBookEntryInputSchema>;

export const DeleteAddressBookEntryInputSchema = v.object({
    addressBookEntryId: IdSchema("addressBookEntryId"),
});

export type DeleteAddressBookEntryInput = v.InferInput<typeof DeleteAddressBookEntryInputSchema>;

export const CopyAddressBookEntryInputSchema = v.pipe(
    v.object({
        addressBookEntryId: IdSchema("addressBookEntryId"),
        targetSubAccountId: OptionalSubAccountIdSchema,
    }),
    v.transform(({ targetSubAccountId, ...rest }) => ({
        ...rest,
        targetSubaccountId: targetSubAccountId,
    })),
);

export type CopyAddressBookEntryInput = v.InferInput<typeof CopyAddressBookEntryInputSchema>;

export const CreateAddressBookTagInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        name: v.pipe(v.string(), v.trim(), v.minLength(1)),
        color: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type CreateAddressBookTagInput = v.InferInput<typeof CreateAddressBookTagInputSchema>;

export const UpdateAddressBookTagInputSchema = v.object({
    tagId: IdSchema("tagId"),
    name: v.pipe(v.string(), v.trim(), v.minLength(1)),
    color: v.optional(v.optional(v.pipe(v.string(), v.trim())), ""),
});

export type UpdateAddressBookTagInput = v.InferInput<typeof UpdateAddressBookTagInputSchema>;

export const DeleteAddressBookTagInputSchema = v.object({
    tagId: IdSchema("tagId"),
});

export type DeleteAddressBookTagInput = v.InferInput<typeof DeleteAddressBookTagInputSchema>;

export const ListTransferCounterpartiesInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        direction: v.optional(v.picklist(TRANSFER_COUNTERPARTY_DIRECTION_VALUES)),
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
        pageSize: PageSizeSchema,
    }),
    v.transform(({ subAccountId, direction, kind, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
        direction: direction
            ? TransferCounterpartyDirectionCodec.inputToProto[direction]
            : undefined,
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
    })),
);

export type ListTransferCounterpartiesInput = v.InferInput<
    typeof ListTransferCounterpartiesInputSchema
>;

export const ListTransferDestinationsInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        kind: v.optional(v.picklist(ADDRESS_BOOK_ENTRY_KIND_VALUES)),
    }),
    v.transform(({ subAccountId, kind }) => ({
        subaccountId: subAccountId,
        kind: kind ? AddressBookEntryKindCodec.inputToProto[kind] : undefined,
    })),
);

export type ListTransferDestinationsInput = v.InferInput<
    typeof ListTransferDestinationsInputSchema
>;

export const SubAccountScopedInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
    }),
    v.transform(({ subAccountId }) => ({
        subaccountId: subAccountId,
    })),
);

export type SubAccountScopedInput = v.InferInput<typeof SubAccountScopedInputSchema>;

export const GetAddressBookViewInputSchema = v.pipe(
    v.object({
        subAccountId: OptionalSubAccountIdSchema,
        pageSize: PageSizeSchema,
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type GetAddressBookViewInput = v.InferInput<typeof GetAddressBookViewInputSchema>;

const CountSchema = v.pipe(
    v.bigint(),
    v.transform((value) => Number(value)),
);

function requiredLabel<TLabel>(label: TLabel | undefined, schemaName: string): TLabel {
    if (label) return label;
    throw new Error(`[PolyesterClient.${schemaName}]: enum value is missing or unspecified`);
}

const AccountScopeSchema = v.pipe(
    v.object({
        scopeType: v.pipe(
            v.enum(Proto.AccountScopeType),
            v.transform((value) =>
                requiredLabel(
                    AccountScopeTypeCodec.protoToOutputWithDefault[value],
                    "AccountScopeSchema",
                ),
            ),
        ),
        rootAccountId: PublicIdSchema,
        subaccountId: PublicIdSchema,
    }),
    v.transform(({ subaccountId, ...scope }) => ({
        ...scope,
        subAccountId: subaccountId,
    })),
);

const ExternalWithdrawAddressSchema = v.object({
    polychainChainId: v.pipe(v.number(), v.integer()),
    address: v.string(),
});

const InternalTransferAccountSchema = v.pipe(
    v.object({
        rootAccountId: PublicIdSchema,
        targetAccountId: PublicIdSchema,
        targetScopeType: v.pipe(
            v.enum(Proto.AccountScopeType),
            v.transform((value) =>
                requiredLabel(
                    AccountScopeTypeCodec.protoToOutputWithDefault[value],
                    "InternalTransferAccountSchema",
                ),
            ),
        ),
        smartAccountAddress: v.string(),
        rootUsername: v.string(),
        subaccountLabel: v.string(),
    }),
    v.transform(({ subaccountLabel, ...account }) => ({
        ...account,
        subAccountLabel: subaccountLabel,
    })),
);

const AddressBookEntryValueSchema = v.variant("case", [
    v.object({ case: v.literal("external"), value: ExternalWithdrawAddressSchema }),
    v.object({ case: v.literal("internal"), value: InternalTransferAccountSchema }),
    v.object({ case: v.undefined(), value: v.optional(v.undefined()) }),
]);

const DestinationWhitelistStatusSchema = v.pipe(
    v.enum(Proto.DestinationWhitelistStatus),
    v.transform((value) =>
        requiredLabel(
            DestinationWhitelistStatusCodec.protoToOutputWithDefault[value],
            "DestinationWhitelistStatusSchema",
        ),
    ),
);

const AddressBookEntryKindSchema = v.pipe(
    v.enum(Proto.AddressBookEntryKind),
    v.transform((value) =>
        requiredLabel(
            AddressBookEntryKindCodec.protoToOutputWithDefault[value],
            "AddressBookEntryKindSchema",
        ),
    ),
);

const TransferCounterpartyDirectionSchema = v.pipe(
    v.enum(Proto.TransferCounterpartyDirection),
    v.transform((value) =>
        requiredLabel(
            TransferCounterpartyDirectionCodec.protoToOutputWithDefault[value],
            "TransferCounterpartyDirectionSchema",
        ),
    ),
);

export const AddressBookSchema = v.object({
    scope: v.optional(AccountScopeSchema),
    callerRole: v.pipe(
        v.enum(SubaccountRole),
        v.transform((role) => SubAccountRoleCodec.protoToOutput[role]),
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

export const InternalTransferWhitelistEntrySchema = v.pipe(
    v.object({
        entryId: PublicIdSchema,
        scope: v.optional(AccountScopeSchema),
        rootAccountId: PublicIdSchema,
        targetAccountId: PublicIdSchema,
        targetScopeType: v.pipe(
            v.enum(Proto.AccountScopeType),
            v.transform((value) =>
                requiredLabel(
                    AccountScopeTypeCodec.protoToOutputWithDefault[value],
                    "InternalTransferWhitelistEntrySchema",
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
                requiredLabel(
                    InternalWhitelistResolutionStatusCodec.protoToOutputWithDefault[value],
                    "InternalTransferWhitelistEntrySchema",
                ),
            ),
        ),
    }),
    v.transform(({ subaccountLabel, ...entry }) => ({
        ...entry,
        subAccountLabel: subaccountLabel,
    })),
);

export type InternalTransferWhitelistEntry = v.InferOutput<
    typeof InternalTransferWhitelistEntrySchema
>;

export const InternalTransferWhitelistEntriesSchema = v.array(InternalTransferWhitelistEntrySchema);

export type InternalTransferWhitelistEntries = v.InferOutput<
    typeof InternalTransferWhitelistEntriesSchema
>;

export const MirroredWithdrawWhitelistEntrySchema = v.pipe(
    v.object({
        canonicalAddress: v.string(),
        rawAddressHex: v.string(),
        updatedAt: TimestampMsSchema,
        polychainChainId: v.pipe(v.number(), v.integer()),
    }),
    v.transform((entry) => entry),
);

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
            }),
        ),
        [],
    ),
    internal: v.optional(
        v.array(
            v.pipe(
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
                            requiredLabel(
                                AccountScopeTypeCodec.protoToOutputWithDefault[value],
                                "AddressBookEntriesViewSchema",
                            ),
                        ),
                    ),
                    smartAccountAddress: v.string(),
                    rootUsername: v.string(),
                    subaccountLabel: v.string(),
                    createdAt: TimestampMsSchema,
                    updatedAt: TimestampMsSchema,
                }),
                v.transform(({ subaccountLabel, ...entry }) => ({
                    ...entry,
                    subAccountLabel: subaccountLabel,
                })),
            ),
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
            v.pipe(
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
                            requiredLabel(
                                AccountScopeTypeCodec.protoToOutputWithDefault[value],
                                "AddressBookRecentDestinationsViewSchema",
                            ),
                        ),
                    ),
                    smartAccountAddress: v.string(),
                    rootUsername: v.string(),
                    subaccountLabel: v.string(),
                }),
                v.transform(({ subaccountLabel, ...entry }) => ({
                    ...entry,
                    subAccountLabel: subaccountLabel,
                })),
            ),
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
});

export type AddressBookView = v.InferOutput<typeof AddressBookViewSchema>;

export function kindFromProto(
    kind: Proto.AddressBookEntryKind,
): AddressBookEntryKindLabel | undefined {
    return AddressBookEntryKindCodec.protoToOutputWithDefault[kind];
}

export function whitelistStatusFromProto(
    status: Proto.DestinationWhitelistStatus,
): DestinationWhitelistStatusLabel | undefined {
    return DestinationWhitelistStatusCodec.protoToOutputWithDefault[status];
}
