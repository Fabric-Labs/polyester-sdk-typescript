import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/deposit/v1/deposit_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import * as v from "valibot";
import {
    CreateDepositAddressInputSchema,
    ListDepositAddressesInputSchema,
    DepositAddressSchema,
    DepositAddressesSchema,
    type CreateDepositAddressInput,
    type ListDepositAddressesInput,
    type DepositAddress,
} from "./deposit.schemas.js";

export class DepositService {
    #client: Client<typeof Proto.DepositAddressService>;
    #resolver?: SubAccountResolver;

    constructor(transport: Transport, resolver?: SubAccountResolver) {
        this.#client = createClient(Proto.DepositAddressService, transport);
        this.#resolver = resolver;
    }

    async createAddress(input: CreateDepositAddressInput): Promise<DepositAddress | null> {
        const resolvedInput = resolveSubAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(CreateDepositAddressInputSchema, resolvedInput);
        const res = await this.#client.createDepositAddress(removeUndefined(validatedInput));
        if (!res.depositAddress) return null;
        return v.parse(DepositAddressSchema, res.depositAddress);
    }

    async listAddresses(input: ListDepositAddressesInput = {}): Promise<DepositAddress[]> {
        const resolvedInput = resolveSubAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(ListDepositAddressesInputSchema, resolvedInput);
        const res = await this.#client.listDepositAddresses(removeUndefined(validatedInput));
        return v.parse(DepositAddressesSchema, res.depositAddresses);
    }
}
