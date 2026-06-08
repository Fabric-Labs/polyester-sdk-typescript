import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import * as v from "valibot";
import {
    AddressBookEntriesSchema,
    AddressBookEntrySchema,
    AddressBookSchema,
    AddressBookTagSchema,
    AddressBookViewSchema,
    CopyAddressBookEntryInputSchema,
    CreateAddressBookEntryInputSchema,
    CreateAddressBookTagInputSchema,
    DeleteAddressBookEntryInputSchema,
    DeleteAddressBookTagInputSchema,
    GetAddressBookViewInputSchema,
    InternalTransferWhitelistEntriesSchema,
    ListAddressBookEntriesInputSchema,
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
    type CopyAddressBookEntryInput,
    type CreateAddressBookEntryInput,
    type CreateAddressBookTagInput,
    type DeleteAddressBookEntryInput,
    type DeleteAddressBookTagInput,
    type GetAddressBookViewInput,
    type InternalTransferWhitelistEntries,
    type ListAddressBookEntriesInput,
    type ListTransferCounterpartiesInput,
    type ListTransferDestinationsInput,
    type SubaccountScopedInput,
    type TransferCounterparties,
    type TransferDestinations,
    type UpdateAddressBookEntryInput,
    type UpdateAddressBookTagInput,
    type WithdrawWhitelistView,
} from "./address-book.schemas.js";

/**
 * Manages saved transfer destinations, tags, whitelist views, and recent counterparties for root or subaccount-scoped address books.
 */
export class AddressBookService {
    #client: Client<typeof Proto.AddressBookService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.AddressBookService, transport);
        this.#resolver = resolver;
    }

    /**
     * Returns the root and subaccount address books visible to the caller, including caller role and display metadata.
     */
    async listBooks(options?: PolyesterRequestOptions): Promise<AddressBook[]> {
        const response = await this.#client.listAddressBooks({}, toConnectCallOptions(options));
        return response.books.map((book) => v.parse(AddressBookSchema, book));
    }

    /**
     * Returns saved address-book entries for the resolved subaccount scope, optionally filtered by external-chain or internal-account destination kind.
     */
    async listEntries(
        input: ListAddressBookEntriesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AddressBookEntries> {
        const request = v.parse(ListAddressBookEntriesInputSchema, this.resolveInput(input));
        const response = await this.#client.listAddressBookEntries(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(AddressBookEntriesSchema, response.entries);
    }

    /**
     * Creates a saved external withdrawal or internal transfer destination in the resolved address book, optionally attaching existing tags and creating new tags in the same request.
     */
    async createEntry(
        input: CreateAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(CreateAddressBookEntryInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Replaces the label, note, and tag set for an existing saved destination.
     */
    async updateEntry(
        input: UpdateAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(UpdateAddressBookEntryInputSchema, input);
        const response = await this.#client.updateAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Deletes one saved destination from the selected address book.
     */
    async deleteEntry(
        input: DeleteAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const request = v.parse(DeleteAddressBookEntryInputSchema, input);
        await this.#client.deleteAddressBookEntry(request, toConnectCallOptions(options));
    }

    /**
     * Copies a saved destination into another visible root or subaccount address book.
     */
    async copyEntry(
        input: CopyAddressBookEntryInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(CopyAddressBookEntryInputSchema, input);
        const response = await this.#client.copyAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    /**
     * Creates a tag in the resolved address book scope for organizing saved destinations.
     */
    async createTag(
        input: CreateAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = v.parse(CreateAddressBookTagInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? v.parse(AddressBookTagSchema, response.tag) : null;
    }

    /**
     * Updates a tag's name and optional color token.
     */
    async updateTag(
        input: UpdateAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = v.parse(UpdateAddressBookTagInputSchema, input);
        const response = await this.#client.updateAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? v.parse(AddressBookTagSchema, response.tag) : null;
    }

    /**
     * Deletes a tag and detaches it from any address-book entries.
     */
    async deleteTag(
        input: DeleteAddressBookTagInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const request = v.parse(DeleteAddressBookTagInputSchema, input);
        await this.#client.deleteAddressBookTag(request, toConnectCallOptions(options));
    }

    /**
     * Returns recent transfer counterparties, including unsaved destinations, with direction, kind, use count, and first/last seen timestamps.
     */
    async listTransferCounterparties(
        input: ListTransferCounterpartiesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<TransferCounterparties> {
        const request = v.parse(ListTransferCounterpartiesInputSchema, this.resolveInput(input));
        const response = await this.#client.listTransferCounterparties(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(TransferCounterpartiesSchema, response.counterparties);
    }

    /**
     * Returns saved and whitelisted destinations available for transfer flows in the resolved address book scope.
     */
    async listTransferDestinations(
        input: ListTransferDestinationsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<TransferDestinations> {
        const request = v.parse(ListTransferDestinationsInputSchema, this.resolveInput(input));
        const response = await this.#client.listTransferDestinations(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(TransferDestinationsSchema, response.destinations);
    }

    /**
     * Returns internal-transfer whitelist entries for the resolved scope, including target account metadata and resolution status.
     */
    async listInternalTransferWhitelistEntries(
        input: SubaccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<InternalTransferWhitelistEntries> {
        const request = v.parse(SubaccountScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.listInternalTransferWhitelistEntries(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(InternalTransferWhitelistEntriesSchema, response.entries);
    }

    /**
     * Returns external and internal withdrawal whitelist requirements plus active mirrored external whitelist entries for the resolved scope.
     */
    async getWithdrawWhitelistView(
        input: SubaccountScopedInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<WithdrawWhitelistView | null> {
        const request = v.parse(SubaccountScopedInputSchema, this.resolveInput(input));
        const response = await this.#client.getWithdrawWhitelistView(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.view ? v.parse(WithdrawWhitelistViewSchema, response.view) : null;
    }

    /**
     * Fetches the combined address-book view used by dashboards: books, saved entries, recent destinations, tags, and withdrawal whitelist status.
     */
    async getView(
        input: GetAddressBookViewInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<AddressBookView> {
        const request = v.parse(GetAddressBookViewInputSchema, this.resolveInput(input));
        const response = await this.#client.getAddressBookView(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(AddressBookViewSchema, response);
    }

    private resolveInput<TInput extends { subaccountId?: string }>(input: TInput): TInput {
        return resolveSubaccountScopedInput(input, this.#resolver);
    }
}
