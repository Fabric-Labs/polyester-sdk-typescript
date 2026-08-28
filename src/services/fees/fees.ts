import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/fees/v1/fees_pb.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { parse } from "../../shared/validation.js";
import {
    GetSpotFeeRatesInputSchema,
    SpotFeeRatesSchema,
    type GetSpotFeeRatesInput,
    type SpotFeeRate,
} from "./fees.schemas.js";

/**
 * Reads authenticated effective spot trading fee rates.
 */
export class FeesService {
    #client: Client<typeof Proto.FeeService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.FeeService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Returns effective maker and taker spot fee rates for the resolved account target, optionally filtered by market identifier.
     */
    async getSpotRates(
        input: GetSpotFeeRatesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<SpotFeeRate[]> {
        const resolvedInput = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(GetSpotFeeRatesInputSchema, resolvedInput);
        const res = await this.#client.getSpotFeeRates(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return parse(SpotFeeRatesSchema, res.feeRates);
    }
}
