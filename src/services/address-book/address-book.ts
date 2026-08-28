import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { AccountScopedInput } from "../../shared/account-scope.js";
import { parse } from "../../shared/validation.js";
import {
    AddressBookEntriesSchema,
    AddressBookEntrySchema,
    AddressBookSchema,
    AddressBookTagSchema,
    AddressBookViewSchema,
    AddressBookViewInvalidatedSchema,
    CopyAddressBookEntryInputSchema,
    CreateAddressBookEntryInputSchema,
    CreateAddressBookTagInputSchema,
    DeleteAddressBookEntryInputSchema,
    DeleteAddressBookTagInputSchema,
    GetAddressBookViewInputSchema,
    InternalTransferWhitelistEntriesSchema,
    ListAddressBookEntriesInputSchema,
    ListInternalTransferWhitelistEntriesInputSchema,
    ListTransferCounterpartiesInputSchema,
    ListTransferDestinationsInputSchema,
    SubaccountScopedInputSchema,
    TransferCounterpartiesSchema,
    TransferDestinationsSchema,
    UpdateAddressBookEntryInputSchema,
    UpdateAddressBookTagInputSchema,
    WithdrawWhitelistViewSchema,
    type AddressBook,
    type AddressBookEntries,
    type AddressBookEntry,
    type AddressBookTag,
    type AddressBookView,
    type AddressBookViewInvalidated,
    type CopyAddressBookEntryInput,
    type CreateAddressBookEntryInput,
    type CreateAddressBookTagInput,
    type DeleteAddressBookEntryInput,
    type DeleteAddressBookTagInput,
    type GetAddressBookViewInput,
    type InternalTransferWhitelistEntries,
    type ListAddressBookEntriesInput,
    type ListInternalTransferWhitelistEntriesInput,
    type ListTransferCounterpartiesInput,
    type ListTransferDestinationsInput,
    type SubaccountScopedInput,
    type TransferCounterparties,
    type TransferDestinations,
    type UpdateAddressBookEntryInput,
    type UpdateAddressBookTagInput,
    type WithdrawWhitelistView,
} from "./address-book.schemas.js";

interface SubscribeViewInvalidationsInput extends BaseSubscribeInput<AddressBookViewInvalidated> {
    rootAccountPublicId: string;
}

/**
 * Manages saved transfer destinations, tags, whitelist views, and recent counterparties for root or subaccount-scoped address books.
 */
export class AddressBookService {
    #client: Client<typeof Proto.AddressBookService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;

    constructor(
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver?: SubaccountResolver,
    ) {
        this.#client = createClient(Proto.AddressBookService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns the root and subaccount address books visible to the caller, including caller role and display metadata.
     */
    async listBooks(options?: PolyesterRequestOptions): Promise<AddressBook[]> {
        const response = await this.#client.listAddressBooks({}, toConnectCallOptions(options));
        return response.books.map((book) => parse(AddressBookSchema, book));
    }

    /**
     * Returns saved address-book entries for the resolved subaccount scope, optionally filtered by external-chain or internal-account destination kind.
     */
    async listEntries(
        input: ListAddressBookEntriesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ entries: AddressBookEntries; nextPageToken: string }> {
        const request = parse(ListAddressBookEntriesInputSchema, this.resolveInput(input));
        const response = await this.#client.listAddressBookEntries(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            entries: parse(AddressBookEntriesSchema, response.entries),
            nextPageToken: response.nextPageToken,
        };
    }

    /**
     * Creates a saved external withdrawal or internal transfer destination in the resolved address book, optionally attaching existing tags and creating new tags in the same request.
     */
    async createEntry(
        input: CreateAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = parse(CreateAddressBookEntryInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Updates selected saved-destination metadata using optimistic concurrency, optionally creating and attaching tags in the same request.
     */
    async updateEntry(
        input: UpdateAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = parse(UpdateAddressBookEntryInputSchema, input);
        const response = await this.#client.updateAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Deletes one saved destination from the selected address book.
     */
    async deleteEntry(
        input: DeleteAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const request = parse(DeleteAddressBookEntryInputSchema, input);
        await this.#client.deleteAddressBookEntry(request, toConnectCallOptions(options));
    }

    /**
     * Copies a saved destination into another visible root or subaccount address book.
     */
    async copyEntry(
        input: CopyAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = parse(CopyAddressBookEntryInputSchema, input);
        const response = await this.#client.copyAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Creates a tag in the resolved address book scope for organizing saved destinations.
     */
    async createTag(
        input: CreateAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = parse(CreateAddressBookTagInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? parse(AddressBookTagSchema, response.tag) : null;
    }

    /**
     * Updates a tag's name and optional color token.
     */
    async updateTag(
        input: UpdateAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = parse(UpdateAddressBookTagInputSchema, input);
        const response = await this.#client.updateAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? parse(AddressBookTagSchema, response.tag) : null;
    }

    /**
     * Deletes a tag and detaches it from any address-book entries.
     */
    async deleteTag(
        input: DeleteAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const request = parse(DeleteAddressBookTagInputSchema, input);
        await this.#client.deleteAddressBookTag(request, toConnectCallOptions(options));
    }

    /**
     * Returns recent transfer counterparties, including unsaved destinations, with direction, kind, use count, and first/last seen timestamps.
     */
    async listTransferCounterparties(
        input: ListTransferCounterpartiesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ counterparties: TransferCounterparties; truncated: boolean }> {
        const request = parse(ListTransferCounterpartiesInputSchema, this.resolveInput(input));
        const response = await this.#client.listTransferCounterparties(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            counterparties: parse(TransferCounterpartiesSchema, response.counterparties),
            truncated: response.truncated,
        };
    }

    /**
     * Returns saved and whitelisted destinations available for transfer flows in the resolved address book scope.
     */
    async listTransferDestinations(
        input: ListTransferDestinationsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ destinations: TransferDestinations; nextPageToken: string }> {
        const request = parse(ListTransferDestinationsInputSchema, this.resolveInput(input));
        const response = await this.#client.listTransferDestinations(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            destinations: parse(TransferDestinationsSchema, response.destinations),
            nextPageToken: response.nextPageToken,
        };
    }

    /**
     * Returns internal-transfer whitelist entries for the resolved scope, including target account metadata and resolution status.
     */
    async listInternalTransferWhitelistEntries(
        input: ListInternalTransferWhitelistEntriesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ entries: InternalTransferWhitelistEntries; nextPageToken: string }> {
        const request = parse(
            ListInternalTransferWhitelistEntriesInputSchema,
            this.resolveInput(input),
        );
        const response = await this.#client.listInternalTransferWhitelistEntries(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return {
            entries: parse(InternalTransferWhitelistEntriesSchema, response.entries),
            nextPageToken: response.nextPageToken,
        };
    }

    /**
     * Returns external and internal withdrawal whitelist requirements plus active mirrored external whitelist entries for the resolved scope.
     */
    async getWithdrawWhitelistView(
        input: SubaccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<WithdrawWhitelistView | null> {
        const request = parse(SubaccountScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.getWithdrawWhitelistView(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.view ? parse(WithdrawWhitelistViewSchema, response.view) : null;
    }

    /**
     * Fetches the combined address-book view used by dashboards: books, saved entries, recent destinations, tags, and withdrawal whitelist status.
     *
     * Pass `minimumViewRevision` (from an invalidation event's `viewRevision`) to make the server wait for its projection to reach that revision instead of returning an older view.
     */
    async getView(
        input: GetAddressBookViewInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AddressBookView> {
        const request = parse(GetAddressBookViewInputSchema, this.resolveInput(input));
        const response = await this.#client.getAddressBookView(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(AddressBookViewSchema, response);
    }

    /**
     * Subscribes to scoped address-book view invalidation signals for a root account.
     *
     * Use `scope` and `invalidatedAt` for diagnostics and ordering, then refetch `getView` for the canonical aggregate (entries, tags, recent destinations, whitelist), passing the event's `viewRevision` as `minimumViewRevision` to avoid reading an older view. Do not patch individual rows from these events.
     */
    subscribeViewInvalidations(input: SubscribeViewInvalidationsInput): () => void {
        const channel = `private:auth:address-books:${input.rootAccountPublicId}:proto`;

        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.AddressBookViewInvalidatedSchema,
            onPublication: (data) => {
                input.onEvent(parse(AddressBookViewInvalidatedSchema, data));
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }

    private resolveInput<TInput extends AccountScopedInput>(input: TInput): TInput {
        return resolveAccountScopedInput(input, this.#resolver);
    }
}
