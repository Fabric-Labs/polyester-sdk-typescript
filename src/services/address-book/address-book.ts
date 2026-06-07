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

/** Optional fresh step-up token from MFA after `freshStepUp` challenge completion. */
export type AddressBookMutationOptions = PolyesterMutationOptions;

export class AddressBookService {
    #client: Client<typeof Proto.AddressBookService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.AddressBookService, transport);
        this.#resolver = resolver;
    }

    async listBooks(options?: PolyesterRequestOptions): Promise<AddressBook[]> {
        const response = await this.#client.listAddressBooks({}, toConnectCallOptions(options));
        return response.books.map((book) => v.parse(AddressBookSchema, book));
    }

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

    async createEntry(
        input: CreateAddressBookEntryInput,
        options?: AddressBookMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(CreateAddressBookEntryInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    async updateEntry(
        input: UpdateAddressBookEntryInput,
        options?: AddressBookMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(UpdateAddressBookEntryInputSchema, input);
        const response = await this.#client.updateAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    async deleteEntry(
        input: DeleteAddressBookEntryInput,
        options?: AddressBookMutationOptions,
    ): Promise<void> {
        const request = v.parse(DeleteAddressBookEntryInputSchema, input);
        await this.#client.deleteAddressBookEntry(request, toConnectCallOptions(options));
    }

    async copyEntry(
        input: CopyAddressBookEntryInput,
        options?: AddressBookMutationOptions,
    ): Promise<AddressBookEntry | null> {
        const request = v.parse(CopyAddressBookEntryInputSchema, input);
        const response = await this.#client.copyAddressBookEntry(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.entry ? v.parse(AddressBookEntrySchema, response.entry) : null;
    }

    async createTag(
        input: CreateAddressBookTagInput,
        options?: AddressBookMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = v.parse(CreateAddressBookTagInputSchema, this.resolveInput(input));
        const response = await this.#client.createAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? v.parse(AddressBookTagSchema, response.tag) : null;
    }

    async updateTag(
        input: UpdateAddressBookTagInput,
        options?: AddressBookMutationOptions,
    ): Promise<AddressBookTag | null> {
        const request = v.parse(UpdateAddressBookTagInputSchema, input);
        const response = await this.#client.updateAddressBookTag(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return response.tag ? v.parse(AddressBookTagSchema, response.tag) : null;
    }

    async deleteTag(
        input: DeleteAddressBookTagInput,
        options?: AddressBookMutationOptions,
    ): Promise<void> {
        const request = v.parse(DeleteAddressBookTagInputSchema, input);
        await this.#client.deleteAddressBookTag(request, toConnectCallOptions(options));
    }

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
