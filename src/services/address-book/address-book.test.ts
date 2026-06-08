import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { SubaccountRole } from "../../gen/auth/v1/subaccounts_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import { subaccountResolverStub, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { describe, expect, it } from "vitest";
import { AddressBookService } from "./address-book.js";

const timestamp = { seconds: 0n, nanos: 0 };

function externalValue() {
    return {
        case: "external" as const,
        value: {
            polychainChainId: 8453,
            address: "0x1111111111111111111111111111111111111111",
        },
    };
}

function tag(id = 5n) {
    return {
        tagId: id,
        name: "Treasury",
        color: "blue",
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function entry(id = 7n) {
    return {
        addressBookEntryId: id,
        kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
        label: "Cold wallet",
        note: "Primary",
        createdAt: timestamp,
        updatedAt: timestamp,
        entry: externalValue(),
        tags: [tag()],
    };
}

describe("AddressBookService", () => {
    it("uses resolver defaults for scoped list requests and trims mapped filters", async () => {
        const transport = unaryTransport({ entries: [entry()] });
        const service = new AddressBookService(transport.transport, subaccountResolverStub("42"));

        await expect(service.listEntries({ kind: "external" })).resolves.toMatchObject([
            {
                addressBookEntryId: formatId(7n),
                kind: "external",
                tags: [{ tagId: formatId(5n) }],
            },
        ]);

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 42n,
            kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
        });
    });

    it("lets an empty explicit subaccount ID force root scope over the resolver", async () => {
        const transport = unaryTransport({ destinations: [] });
        const service = new AddressBookService(transport.transport, subaccountResolverStub("42"));

        await expect(
            service.listTransferDestinations({ subaccountId: "", kind: "internal" }),
        ).resolves.toEqual([]);

        expect(transport.lastCall()?.message).toEqual({
            kind: Proto.AddressBookEntryKind.INTERNAL_ACCOUNT,
        });
    });

    it("normalizes entry and tag mutations, preserves void deletes, and returns null for empty mutation responses", async () => {
        const responses = [
            { entry: entry() },
            {},
            {},
            { entry: entry(8n) },
            { tag: tag() },
            {},
            {},
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new AddressBookService(transport.transport, subaccountResolverStub("42"));
        const cases = [
            {
                run: () =>
                    service.createEntry(
                        {
                            label: " Cold wallet ",
                            note: " Primary ",
                            entry: {
                                kind: "external" as const,
                                polychainChainId: 8453,
                                address: " 0x1111111111111111111111111111111111111111 ",
                            },
                            tagIds: ["5"],
                            newTags: [{ name: " Treasury ", color: " blue " }],
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    subaccountId: 42n,
                    label: "Cold wallet",
                    note: "Primary",
                    entry: externalValue(),
                    tagIds: [5n],
                    newTags: [{ name: "Treasury", color: "blue" }],
                },
                result: { addressBookEntryId: formatId(7n) },
            },
            {
                run: () =>
                    service.updateEntry(
                        {
                            addressBookEntryId: "7",
                            label: " Updated ",
                            note: " Note ",
                            tagIds: ["5"],
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    addressBookEntryId: 7n,
                    label: "Updated",
                    note: "Note",
                    tagIds: [5n],
                },
                result: null,
            },
            {
                run: () =>
                    service.deleteEntry(
                        { addressBookEntryId: "7" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { addressBookEntryId: 7n },
                result: undefined,
            },
            {
                run: () =>
                    service.copyEntry(
                        { addressBookEntryId: "7", targetSubaccountId: "99" },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { addressBookEntryId: 7n, targetSubaccountId: 99n },
                result: { addressBookEntryId: formatId(8n) },
            },
            {
                run: () =>
                    service.createTag(
                        { name: " Treasury ", color: " blue " },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { subaccountId: 42n, name: "Treasury", color: "blue" },
                result: { tagId: formatId(5n) },
            },
            {
                run: () =>
                    service.updateTag(
                        { tagId: "5", name: " Ops ", color: " green " },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { tagId: 5n, name: "Ops", color: "green" },
                result: null,
            },
            {
                run: () => service.deleteTag({ tagId: "5" }, { stepUpToken: " fresh-token " }),
                expected: { tagId: 5n },
                result: undefined,
            },
        ];

        for (const testCase of cases) {
            const result = await testCase.run();
            if (testCase.result === null || testCase.result === undefined) {
                expect(result).toBe(testCase.result);
            } else {
                expect(result).toMatchObject(testCase.result);
            }
            const call = transport.lastCall();
            expect(call?.message).toMatchObject(testCase.expected);
            expect(new Headers(call?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe("fresh-token");
        }
    });

    it("parses book, counterparty, destination, whitelist, and aggregate view responses", async () => {
        const responses = [
            {
                books: [
                    {
                        callerRole: SubaccountRole.OWNER,
                        label: "Main",
                        ownerUsername: "owner",
                        smartAccountAddress: "0x1111111111111111111111111111111111111111",
                    },
                ],
            },
            {
                counterparties: [
                    {
                        counterpartyId: 9n,
                        direction: Proto.TransferCounterpartyDirection.WITHDRAW_TO,
                        kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
                        saved: true,
                        addressBookEntryId: 7n,
                        useCount: 3n,
                        firstSeenAt: timestamp,
                        lastSeenAt: timestamp,
                        counterparty: externalValue(),
                    },
                ],
            },
            {
                entries: [
                    {
                        entryId: 10n,
                        rootAccountId: 1n,
                        targetAccountId: 2n,
                        targetScopeType: Proto.AccountScopeType.SCOPE_SUBACCOUNT,
                        smartAccountAddress: "0x2222222222222222222222222222222222222222",
                        rootUsername: "root",
                        subaccountLabel: "Desk",
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        resolutionStatus:
                            Proto.InternalWhitelistResolutionStatus.INTERNAL_WHITELIST_RESOLVED,
                    },
                ],
            },
            {
                view: {
                    externalWhitelistRequired: true,
                    internalWhitelistRequired: false,
                    activeEntries: [
                        {
                            canonicalAddress: "0x1111111111111111111111111111111111111111",
                            rawAddressHex: "0x1111",
                            updatedAt: timestamp,
                            polychainChainId: 8453,
                        },
                    ],
                },
            },
            {
                books: [],
                entries: { external: [], internal: [] },
                recentDestinations: { external: [], internal: [] },
                tags: [{ tagId: 5n, name: "Treasury", color: "blue" }],
                withdrawWhitelist: {
                    externalWhitelistRequired: true,
                    internalWhitelistRequired: false,
                },
            },
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new AddressBookService(transport.transport);

        await expect(service.listBooks()).resolves.toMatchObject([
            { callerRole: "owner", label: "Main" },
        ]);
        await expect(
            service.listTransferCounterparties({
                direction: "withdrawTo",
                kind: "external",
                pageSize: 25,
            }),
        ).resolves.toMatchObject([
            {
                counterpartyId: formatId(9n),
                direction: "withdrawTo",
                useCount: 3,
            },
        ]);
        await expect(service.listInternalTransferWhitelistEntries()).resolves.toMatchObject([
            {
                entryId: formatId(10n),
                targetScopeType: "subaccount",
                resolutionStatus: "resolved",
            },
        ]);
        await expect(service.getWithdrawWhitelistView()).resolves.toMatchObject({
            externalWhitelistRequired: true,
            activeEntries: [{ polychainChainId: 8453 }],
        });
        await expect(service.getView({ pageSize: 50 })).resolves.toMatchObject({
            tags: [{ tagId: formatId(5n), name: "Treasury" }],
            withdrawWhitelist: { externalWhitelistRequired: true },
        });

        expect(transport.calls.map((call) => call.message)).toMatchObject([
            {},
            {
                direction: Proto.TransferCounterpartyDirection.WITHDRAW_TO,
                kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
                pageSize: 25,
            },
            {},
            {},
            { pageSize: 50 },
        ]);
    });

    it("returns null when withdraw whitelist view is absent", async () => {
        const transport = unaryTransport({});
        const service = new AddressBookService(transport.transport);

        await expect(service.getWithdrawWhitelistView()).resolves.toBeNull();
    });
});
