import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/address_book_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
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
	SubAccountScopedInputSchema,
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
	type SubAccountScopedInput,
	type TransferCounterparties,
	type TransferDestinations,
	type UpdateAddressBookEntryInput,
	type UpdateAddressBookTagInput,
	type WithdrawWhitelistView,
} from "./address-book.schemas.js";

/** Optional fresh step-up token from MFA after `freshStepUp` challenge completion. */
export type AddressBookMutationOptions = {
	stepUpToken?: string | null;
};

export class AddressBookService {
	#client: Client<typeof Proto.AddressBookService>;
	#resolver?: SubAccountResolver;

	constructor(transport: Transport, resolver?: SubAccountResolver) {
		this.#client = createClient(Proto.AddressBookService, transport);
		this.#resolver = resolver;
	}

	async listBooks(): Promise<AddressBook[]> {
		const response = await this.#client.listAddressBooks({});
		return response.books.map((book) => AddressBookSchema.parse(book));
	}

	async listEntries(input: ListAddressBookEntriesInput = {}): Promise<AddressBookEntries> {
		const request = ListAddressBookEntriesInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.listAddressBookEntries(removeUndefined(request));
		return AddressBookEntriesSchema.parse(response.entries);
	}

	async createEntry(
		input: CreateAddressBookEntryInput,
		options?: AddressBookMutationOptions
	): Promise<AddressBookEntry | null> {
		const request = CreateAddressBookEntryInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.createAddressBookEntry(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.entry ? AddressBookEntrySchema.parse(response.entry) : null;
	}

	async updateEntry(
		input: UpdateAddressBookEntryInput,
		options?: AddressBookMutationOptions
	): Promise<AddressBookEntry | null> {
		const request = UpdateAddressBookEntryInputSchema.parse(input);
		const response = await this.#client.updateAddressBookEntry(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.entry ? AddressBookEntrySchema.parse(response.entry) : null;
	}

	async deleteEntry(
		input: DeleteAddressBookEntryInput,
		options?: AddressBookMutationOptions
	): Promise<void> {
		const request = DeleteAddressBookEntryInputSchema.parse(input);
		await this.#client.deleteAddressBookEntry(request, stepUpCallOptions(options?.stepUpToken));
	}

	async copyEntry(
		input: CopyAddressBookEntryInput,
		options?: AddressBookMutationOptions
	): Promise<AddressBookEntry | null> {
		const request = CopyAddressBookEntryInputSchema.parse(input);
		const response = await this.#client.copyAddressBookEntry(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.entry ? AddressBookEntrySchema.parse(response.entry) : null;
	}

	async createTag(
		input: CreateAddressBookTagInput,
		options?: AddressBookMutationOptions
	): Promise<AddressBookTag | null> {
		const request = CreateAddressBookTagInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.createAddressBookTag(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.tag ? AddressBookTagSchema.parse(response.tag) : null;
	}

	async updateTag(
		input: UpdateAddressBookTagInput,
		options?: AddressBookMutationOptions
	): Promise<AddressBookTag | null> {
		const request = UpdateAddressBookTagInputSchema.parse(input);
		const response = await this.#client.updateAddressBookTag(
			removeUndefined(request),
			stepUpCallOptions(options?.stepUpToken)
		);
		return response.tag ? AddressBookTagSchema.parse(response.tag) : null;
	}

	async deleteTag(
		input: DeleteAddressBookTagInput,
		options?: AddressBookMutationOptions
	): Promise<void> {
		const request = DeleteAddressBookTagInputSchema.parse(input);
		await this.#client.deleteAddressBookTag(request, stepUpCallOptions(options?.stepUpToken));
	}

	async listTransferCounterparties(
		input: ListTransferCounterpartiesInput = {}
	): Promise<TransferCounterparties> {
		const request = ListTransferCounterpartiesInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.listTransferCounterparties(removeUndefined(request));
		return TransferCounterpartiesSchema.parse(response.counterparties);
	}

	async listTransferDestinations(
		input: ListTransferDestinationsInput = {}
	): Promise<TransferDestinations> {
		const request = ListTransferDestinationsInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.listTransferDestinations(removeUndefined(request));
		return TransferDestinationsSchema.parse(response.destinations);
	}

	async listInternalTransferWhitelistEntries(
		input: SubAccountScopedInput = {}
	): Promise<InternalTransferWhitelistEntries> {
		const request = SubAccountScopedInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.listInternalTransferWhitelistEntries(
			removeUndefined(request)
		);
		return InternalTransferWhitelistEntriesSchema.parse(response.entries);
	}

	async getWithdrawWhitelistView(
		input: SubAccountScopedInput = {}
	): Promise<WithdrawWhitelistView | null> {
		const request = SubAccountScopedInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.getWithdrawWhitelistView(removeUndefined(request));
		return response.view ? WithdrawWhitelistViewSchema.parse(response.view) : null;
	}

	async getView(input: GetAddressBookViewInput = {}): Promise<AddressBookView> {
		const request = GetAddressBookViewInputSchema.parse(this.resolveInput(input));
		const response = await this.#client.getAddressBookView(removeUndefined(request));
		return AddressBookViewSchema.parse(response);
	}

	private resolveInput<TInput extends { subAccountId?: string }>(input: TInput): TInput {
		return resolveSubAccountScopedInput(input, this.#resolver);
	}
}
