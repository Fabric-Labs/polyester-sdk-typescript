import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const ACCOUNT_SCOPE_TYPE_VALUES = ["root", "subaccount"] as const;
export type AccountScopeTypeLabel = (typeof ACCOUNT_SCOPE_TYPE_VALUES)[number];

export const AccountScopeTypeCodec = {
    inputToProto: {
        root: Proto.AccountScopeType.SCOPE_ROOT,
        subaccount: Proto.AccountScopeType.SCOPE_SUBACCOUNT,
    } satisfies InputToProto<AccountScopeTypeLabel, Proto.AccountScopeType>,
    protoToOutput: {
        [Proto.AccountScopeType.SCOPE_ROOT]: "root",
        [Proto.AccountScopeType.SCOPE_SUBACCOUNT]: "subaccount",
    } satisfies ProtoToOutput<Proto.AccountScopeType, AccountScopeTypeLabel>,
} as const;

export const ADDRESS_BOOK_ENTRY_KIND_VALUES = ["external", "internal"] as const;
export type AddressBookEntryKindLabel = (typeof ADDRESS_BOOK_ENTRY_KIND_VALUES)[number];

export const AddressBookEntryKindCodec = {
    inputToProto: {
        external: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
        internal: Proto.AddressBookEntryKind.INTERNAL_ACCOUNT,
    } satisfies InputToProto<AddressBookEntryKindLabel, Proto.AddressBookEntryKind>,
    protoToOutput: {
        [Proto.AddressBookEntryKind.EXTERNAL_CHAIN]: "external",
        [Proto.AddressBookEntryKind.INTERNAL_ACCOUNT]: "internal",
    } satisfies ProtoToOutput<Proto.AddressBookEntryKind, AddressBookEntryKindLabel>,
} as const;

export const DESTINATION_WHITELIST_STATUS_VALUES = [
    "notWhitelisted",
    "active",
    "unresolved",
] as const;
export type DestinationWhitelistStatusLabel = (typeof DESTINATION_WHITELIST_STATUS_VALUES)[number];

export const DestinationWhitelistStatusCodec = {
    protoToOutput: {
        [Proto.DestinationWhitelistStatus.DESTINATION_NOT_WHITELISTED]: "notWhitelisted",
        [Proto.DestinationWhitelistStatus.DESTINATION_WHITELIST_ACTIVE]: "active",
        [Proto.DestinationWhitelistStatus.DESTINATION_WHITELIST_UNRESOLVED]: "unresolved",
    } satisfies ProtoToOutput<Proto.DestinationWhitelistStatus, DestinationWhitelistStatusLabel>,
} as const;

export const INTERNAL_WHITELIST_RESOLUTION_STATUS_VALUES = ["resolved", "unresolved"] as const;
export type InternalWhitelistResolutionStatusLabel =
    (typeof INTERNAL_WHITELIST_RESOLUTION_STATUS_VALUES)[number];

export const InternalWhitelistResolutionStatusCodec = {
    protoToOutput: {
        [Proto.InternalWhitelistResolutionStatus.INTERNAL_WHITELIST_RESOLVED]: "resolved",
        [Proto.InternalWhitelistResolutionStatus.INTERNAL_WHITELIST_UNRESOLVED]: "unresolved",
    } satisfies ProtoToOutput<
        Proto.InternalWhitelistResolutionStatus,
        InternalWhitelistResolutionStatusLabel
    >,
} as const;

export const TRANSFER_COUNTERPARTY_DIRECTION_VALUES = [
    "depositFrom",
    "withdrawTo",
    "internalTransferFrom",
    "internalTransferTo",
] as const;
export type TransferCounterpartyDirectionLabel =
    (typeof TRANSFER_COUNTERPARTY_DIRECTION_VALUES)[number];

export const TransferCounterpartyDirectionCodec = {
    inputToProto: {
        depositFrom: Proto.TransferCounterpartyDirection.DEPOSIT_FROM,
        withdrawTo: Proto.TransferCounterpartyDirection.WITHDRAW_TO,
        internalTransferFrom: Proto.TransferCounterpartyDirection.INTERNAL_TRANSFER_FROM,
        internalTransferTo: Proto.TransferCounterpartyDirection.INTERNAL_TRANSFER_TO,
    } satisfies InputToProto<
        TransferCounterpartyDirectionLabel,
        Proto.TransferCounterpartyDirection
    >,
    protoToOutput: {
        [Proto.TransferCounterpartyDirection.DEPOSIT_FROM]: "depositFrom",
        [Proto.TransferCounterpartyDirection.WITHDRAW_TO]: "withdrawTo",
        [Proto.TransferCounterpartyDirection.INTERNAL_TRANSFER_FROM]: "internalTransferFrom",
        [Proto.TransferCounterpartyDirection.INTERNAL_TRANSFER_TO]: "internalTransferTo",
    } satisfies ProtoToOutput<
        Proto.TransferCounterpartyDirection,
        TransferCounterpartyDirectionLabel
    >,
} as const;
