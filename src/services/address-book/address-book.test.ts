import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { SubaccountRole } from "../../gen/auth/v1/subaccounts_pb.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import {
    realtimeClientStub,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { describe, expect, it, vi } from "vitest";
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
        revision: 4n,
    };
}

describe("AddressBookService", () => {
    it("uses resolver defaults for scoped list requests and trims mapped filters", async () => {
        const transport = unaryTransport({ entries: [entry()], nextPageToken: "next" });
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(42n)),
        );

        await expect(service.listEntries({ kind: "external" })).resolves.toMatchObject({
            entries: [
                {
                    addressBookEntryId: formatId(7n),
                    kind: "external",
                    tags: [{ tagId: formatId(5n) }],
                },
            ],
            nextPageToken: "next",
        });

        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 42n,
            kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
            pageToken: "",
        });
    });

    it("lets explicit main scope force root scope over the resolver", async () => {
        const transport = unaryTransport({ destinations: [], nextPageToken: "" });
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(42n)),
        );

        await expect(
            service.listTransferDestinations({ account: "main", kind: "internal" }),
        ).resolves.toEqual({ destinations: [], nextPageToken: "" });

        expect(transport.lastCall()?.message).toEqual({
            kind: Proto.AddressBookEntryKind.INTERNAL_ACCOUNT,
            pageToken: "",
        });
    });

    it("normalizes entry and tag mutations, preserves void deletes, and returns null for empty mutation responses", async () => {
        const responses = [
            { entry: entry() },
            { entry: entry() },
            {},
            { entry: entry(8n) },
            { tag: tag() },
            {},
            {},
        ];
        const transport = unaryTransport((_call, index) => responses[index] ?? {});
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
            subaccountResolverStub(formatId(42n)),
        );
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
                            tagIds: [formatId(5n)],
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
                            addressBookEntryId: formatId(7n),
                            expectedRevision: "4",
                            label: " Updated ",
                            note: " Note ",
                            tagIds: [formatId(5n)],
                            newTags: [{ name: " Operations ", color: " green " }],
                        },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: {
                    addressBookEntryId: 7n,
                    entry: {
                        label: "Updated",
                        note: "Note",
                        tagIds: [5n],
                        newTags: [{ name: "Operations", color: "green" }],
                    },
                    updateMask: { paths: ["label", "note", "tag_ids", "new_tags"] },
                    expectedRevision: 4n,
                },
                result: { addressBookEntryId: formatId(7n), revision: "4" },
            },
            {
                run: () =>
                    service.deleteEntry(
                        { addressBookEntryId: formatId(7n) },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { addressBookEntryId: 7n },
                result: undefined,
            },
            {
                run: () =>
                    service.copyEntry(
                        {
                            addressBookEntryId: formatId(7n),
                            targetSubaccountId: formatId(99n),
                        },
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
                        { tagId: formatId(5n), name: " Ops ", color: " green " },
                        { stepUpToken: " fresh-token " },
                    ),
                expected: { tagId: 5n, name: "Ops", color: "green" },
                result: null,
            },
            {
                run: () =>
                    service.deleteTag({ tagId: formatId(5n) }, { stepUpToken: " fresh-token " }),
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

    it("preserves omitted tag fields and transmits an explicit empty color", async () => {
        const transport = unaryTransport({ tag: tag() });
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await service.updateTag({ tagId: formatId(5n), color: "" });

        expect(transport.lastCall()?.message).toEqual({ tagId: 5n, color: "" });
        expect(transport.lastCall()?.message).not.toHaveProperty("name");
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
                truncated: true,
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
                nextPageToken: "whitelist-next",
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
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await expect(service.listBooks()).resolves.toMatchObject([
            { callerRole: "owner", label: "Main" },
        ]);
        await expect(
            service.listTransferCounterparties({
                direction: "withdrawTo",
                kind: "external",
                limit: 25,
            }),
        ).resolves.toMatchObject({
            counterparties: [
                {
                    counterpartyId: formatId(9n),
                    direction: "withdrawTo",
                    useCount: 3,
                },
            ],
            truncated: true,
        });
        await expect(service.listInternalTransferWhitelistEntries()).resolves.toMatchObject({
            entries: [
                {
                    entryId: formatId(10n),
                    targetScopeType: "subaccount",
                    resolutionStatus: "resolved",
                },
            ],
            nextPageToken: "whitelist-next",
        });
        await expect(service.getWithdrawWhitelistView()).resolves.toMatchObject({
            externalWhitelistRequired: true,
            activeEntries: [{ polychainChainId: 8453 }],
        });
        await expect(
            service.getView({ limit: 50, minimumViewRevision: "7" }),
        ).resolves.toMatchObject({
            tags: [{ tagId: formatId(5n), name: "Treasury" }],
            withdrawWhitelist: { externalWhitelistRequired: true },
            viewRevision: "0",
        });

        expect(transport.calls.map((call) => call.message)).toMatchObject([
            {},
            {
                direction: Proto.TransferCounterpartyDirection.WITHDRAW_TO,
                kind: Proto.AddressBookEntryKind.EXTERNAL_CHAIN,
                limit: 25,
            },
            { pageToken: "" },
            {},
            { limit: 50, minimumViewRevision: 7n },
        ]);
    });

    it("subscribeViewInvalidations parses scoped invalidation publications", () => {
        const realtime = realtimeClientStub();
        const service = new AddressBookService(
            { authApi: unaryTransport({}).transport },
            realtime.realtime,
        );
        const onEvent = vi.fn();
        const onOpen = vi.fn();
        const onClose = vi.fn();
        const onError = vi.fn();

        const unsubscribe = service.subscribeViewInvalidations({
            rootAccountPublicId: "root-public",
            onEvent,
            onOpen,
            onClose,
            onError,
        });

        expect(realtime.params?.channel).toBe("private:auth:address-books:root-public:proto");
        expect(realtime.params?.schema).toBe(Proto.AddressBookViewInvalidatedSchema);
        realtime.params?.onConnected?.();
        realtime.params?.onDisconnected?.();
        realtime.params?.onError?.({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        realtime.params?.onPublication({
            scope: {
                scopeType: Proto.AccountScopeType.SCOPE_SUBACCOUNT,
                rootAccountId: 1n,
                subaccountId: 2n,
            },
            invalidatedAt: { seconds: 1_700_000_010n, nanos: 500_000_000 },
        } as Proto.AddressBookViewInvalidated);

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith({
            channel: "channel",
            type: "transport",
            error: { code: 0, message: "boom" },
        });
        expect(onEvent).toHaveBeenCalledWith({
            scope: {
                scopeType: "subaccount",
                rootAccountId: formatId(1n),
                subaccountId: formatId(2n),
            },
            invalidatedAt: 1_700_000_010_500,
            viewRevision: "0",
        });

        unsubscribe();
        expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("returns null when withdraw whitelist view is absent", async () => {
        const transport = unaryTransport({});
        const service = new AddressBookService(
            { authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await expect(service.getWithdrawWhitelistView()).resolves.toBeNull();
    });
});
