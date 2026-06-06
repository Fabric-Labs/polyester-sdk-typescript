import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/deposit/v1/deposit_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import {
	CreateDepositAddressInputSchema,
	ListDepositAddressesInputSchema,
	DepositAddressSchema,
	DepositAddressesSchema,
	type CreateDepositAddressInput,
	type ListDepositAddressesInput,
	type DepositAddress,
} from "./deposit.schemas.js";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime.js";

export class DepositService {
	#client: Client<typeof Proto.DepositAddressService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.DepositAddressService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async createAddress(input: CreateDepositAddressInput): Promise<DepositAddress | null> {
		this.#localMock?.assertMutationAllowed("deposit.createAddress");
		const resolvedInput = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = CreateDepositAddressInputSchema.parse(resolvedInput);
		const res = await this.#client.createDepositAddress(removeUndefined(validatedInput));
		if (!res.depositAddress) return null;
		return DepositAddressSchema.parse(res.depositAddress);
	}

	async listAddresses(input: ListDepositAddressesInput = {}): Promise<DepositAddress[]> {
		if (this.#localMock?.isEnabled()) return [];
		const resolvedInput = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = ListDepositAddressesInputSchema.parse(resolvedInput);
		const res = await this.#client.listDepositAddresses(removeUndefined(validatedInput));
		return DepositAddressesSchema.parse(res.depositAddresses);
	}
}
