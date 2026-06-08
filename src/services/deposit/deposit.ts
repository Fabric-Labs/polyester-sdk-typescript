import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/chain/deposit/v1/deposit_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
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

/**
 * Manages chain deposit addresses for root accounts and subaccounts.
 */
export class DepositService {
    #client: Client<typeof Proto.DepositAddressService>;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.DepositAddressService, transport);
        this.#resolver = resolver;
    }

    /**
     * Creates or returns the deposit address assigned to the resolved account target for a selected chain. Returns null if the backend response does not include an address.
     */
    async createAddress(
        input: CreateDepositAddressInput,
        options?: PolyesterMutationOptions,
    ): Promise<DepositAddress | null> {
        const resolvedInput = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(CreateDepositAddressInputSchema, resolvedInput);
        const res = await this.#client.createDepositAddress(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!res.depositAddress) return null;
        return v.parse(DepositAddressSchema, res.depositAddress);
    }

    /**
     * Lists known deposit addresses for the resolved account target, optionally filtered by chain. Results are ordered by ascending chain id in the generated proto contract.
     */
    async listAddresses(
        input: ListDepositAddressesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<DepositAddress[]> {
        const resolvedInput = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(ListDepositAddressesInputSchema, resolvedInput);
        const res = await this.#client.listDepositAddresses(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return v.parse(DepositAddressesSchema, res.depositAddresses);
    }
}
