import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    AddressBookEntrySchema,
    AddressBookViewInvalidatedSchema,
    CreateAddressBookEntryInputSchema,
    ListTransferCounterpartiesInputSchema,
    UpdateAddressBookEntryInputSchema,
    UpdateAddressBookTagInputSchema,
} from "./address-book.schemas.js";

const baseExternalEntry = {
    addressBookEntryId: 7n,
    scope: {
        scopeType: Proto.AccountScopeType.SCOPE_SUBACCOUNT,
        rootAccountId: 1n,
        subaccountId: 2n,
    },
    kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
    label: "Treasury",
    note: "cold wallet",
    createdAt: { seconds: 1_700_000_000n, nanos: 250_000_000 },
    updatedAt: { seconds: 1_700_000_001n },
    entry: {
        case: "external" as const,
        value: {
            polychainChainId: 8453,
            address: "0x0000000000000000000000000000000000000001",
        },
    },
    tags: [
        {
            tagId: 5n,
            name: "ops",
            color: "blue",
            createdAt: { seconds: 1_700_000_002n },
            updatedAt: { seconds: 1_700_000_003n },
        },
    ],
    revision: 4n,
};

describe("CreateAddressBookEntryInputSchema", () => {
    it("normalizes external entries, tags, and public ID inputs", () => {
        const input = v.parse(CreateAddressBookEntryInputSchema, {
            account: { subaccountId: " 42 " },
            label: " Treasury ",
            note: " ops ",
            entry: {
                kind: "external",
                polychainChainId: 8453,
                address: " 0x0000000000000000000000000000000000000001 ",
            },
            tagIds: [" 5 "],
            newTags: [{ name: " High value ", color: " amber " }],
        });

        expect(input).toEqual({
            subaccountId: 42n,
            label: "Treasury",
            note: "ops",
            tagIds: [5n],
            newTags: [{ name: "High value", color: "amber" }],
            entry: {
                case: "external",
                value: {
                    polychainChainId: 8453,
                    address: "0x0000000000000000000000000000000000000001",
                },
            },
        });
    });

    it("normalizes internal entries into proto oneof shape", () => {
        const input = v.parse(CreateAddressBookEntryInputSchema, {
            label: "Desk",
            entry: {
                kind: "internal",
                smartAccountAddress: " 0x0000000000000000000000000000000000000002 ",
            },
        });

        expect(input.entry).toEqual({
            case: "internal",
            value: {
                smartAccountAddress: "0x0000000000000000000000000000000000000002",
            },
        });
    });
});

describe("address-book patch schemas", () => {
    it("builds a tag-list clear without synthesizing label or note", () => {
        expect(
            v.parse(UpdateAddressBookEntryInputSchema, {
                addressBookEntryId: "7",
                expectedRevision: "4",
                tagIds: [],
            }),
        ).toEqual({
            addressBookEntryId: 7n,
            entry: { tagIds: [] },
            updateMask: { paths: ["tag_ids"] },
            expectedRevision: 4n,
        });
    });

    it("distinguishes omitted tag fields from an explicit color clear", () => {
        expect(v.parse(UpdateAddressBookTagInputSchema, { tagId: "5", color: "" })).toEqual({
            tagId: 5n,
            color: "",
        });
    });
});

describe("ListTransferCounterpartiesInputSchema", () => {
    it("maps filters to proto enums and rejects invalid limits", () => {
        const input = v.parse(ListTransferCounterpartiesInputSchema, {
            account: { subaccountId: "3" },
            direction: "withdrawTo",
            kind: "external",
            limit: 50,
        });

        expect(input).toEqual({
            subaccountId: 3n,
            direction: Proto.TransferCounterpartyDirection.WITHDRAW_TO,
            kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
            limit: 50,
        });
        expect(() => v.parse(ListTransferCounterpartiesInputSchema, { limit: 201 })).toThrow();
    });
});

describe("AddressBookEntrySchema", () => {
    it("formats IDs, labels enum values, and converts proto timestamps", () => {
        const entry = v.parse(AddressBookEntrySchema, baseExternalEntry);

        expect(entry).toMatchObject({
            addressBookEntryId: formatId(7n),
            scope: {
                scopeType: "subaccount",
                rootAccountId: formatId(1n),
                subaccountId: formatId(2n),
            },
            kind: "external",
            createdAt: 1_700_000_000_250,
            updatedAt: 1_700_000_001_000,
            revision: "4",
            tags: [
                {
                    tagId: formatId(5n),
                    createdAt: 1_700_000_002_000,
                    updatedAt: 1_700_000_003_000,
                },
            ],
        });
    });

    it("preserves proto-zero enum values as unspecified", () => {
        expect(
            v.parse(AddressBookEntrySchema, {
                ...baseExternalEntry,
                kind: Proto.AddressBookEntryKind.ENTRY_KIND_UNSPECIFIED,
            }),
        ).toMatchObject({ kind: "unspecified" });
    });
});

describe("AddressBookViewInvalidatedSchema", () => {
    it("formats scope IDs and invalidation timestamps", () => {
        const event = v.parse(AddressBookViewInvalidatedSchema, {
            scope: {
                scopeType: Proto.AccountScopeType.SCOPE_SUBACCOUNT,
                rootAccountId: 1n,
                subaccountId: 2n,
            },
            invalidatedAt: { seconds: 1_700_000_010n, nanos: 500_000_000 },
        });

        expect(event).toEqual({
            scope: {
                scopeType: "subaccount",
                rootAccountId: formatId(1n),
                subaccountId: formatId(2n),
            },
            invalidatedAt: 1_700_000_010_500,
        });
    });
});
