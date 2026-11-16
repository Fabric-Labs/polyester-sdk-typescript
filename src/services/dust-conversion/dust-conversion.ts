import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/transfer/v1/dust_conversion_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { resolveAccountScopedInput, type SubaccountResolver } from "../subaccount-resolver.js";
import {
    CreateDustConversionInputSchema,
    DustConversionQuoteSchema,
    DustConversionSchema,
    GetDustConversionInputSchema,
    ListDustBalancesInputSchema,
    ListDustBalancesResultSchema,
    ListDustConversionsInputSchema,
    ListDustConversionsResultSchema,
    QuoteDustConversionInputSchema,
    type CreateDustConversionInput,
    type DustConversion,
    type DustConversionQuote,
    type GetDustConversionInput,
    type ListDustBalancesInput,
    type ListDustBalancesResult,
    type ListDustConversionsInput,
    type ListDustConversionsResult,
    type QuoteDustConversionInput,
} from "./dust-conversion.schemas.js";

/**
 * Converts dust, Trading balances too small to trade, into one target asset at index prices
 * less a disclosed fee. Flow: `quote`, then `create` with the quote, then `get` while the
 * conversion is `processing`. A conversion moves every source and credits the payout
 * atomically, or moves nothing.
 *
 * Limits: a balance converts when no open market takes an order for it and it is worth at most
 * 10 USD; one conversion takes at most 20 balances worth at most 200 USD together; an account
 * converts once every 6 hours, refused conversions excepted; each target has a daily limit.
 *
 * Quoting, converting and reading conversions need the `convert-dust` policy action on API keys
 * and the `convert_dust` permission on subaccounts (owner, admin, trader or leveraged trader);
 * a subaccount's default policy does not grant it. `listBalances` needs `read-balances`. No
 * step-up is required.
 */
export class DustConversionService {
    #client: Client<typeof Proto.DustConversionService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.DustConversionService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Lists every nonzero available Trading balance with its eligibility for one target and
     * the payout the eligible ones would bring now. Reserves nothing. An unknown
     * `targetAssetId` throws `ValidationError`.
     */
    async listBalances(
        input: ListDustBalancesInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListDustBalancesResult> {
        const request = parse(
            ListDustBalancesInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.listDustBalances(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListDustBalancesResultSchema, response);
    }

    /**
     * Prices the account's dust into a target. The quote is valid for 30 seconds and reserves
     * nothing; an empty `quoteId` means nothing converts. A target that cannot be paid now
     * throws `PreconditionFailedError` (`DUST_TARGET_UNAVAILABLE`).
     */
    async quote(
        input: QuoteDustConversionInput,
        options?: PolyesterRequestOptions,
    ): Promise<DustConversionQuote> {
        const request = parse(
            QuoteDustConversionInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.quoteDustConversion(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(DustConversionQuoteSchema, response);
    }

    /**
     * Converts a quote at current index prices, or returns the conversion already made under
     * `idempotencyKey`. The result is `completed`, or `processing` while its outcome is not
     * known yet; read it again with `get`. Every source must still be the whole balance the
     * quote showed.
     *
     * Quote again on `PreconditionFailedError` with `DUST_QUOTE_EXPIRED`, `DUST_PRICE_MOVED`
     * (payout fell more than 1% below the quote), `DUST_BALANCE_CHANGED`, `DUST_NOT_ELIGIBLE`
     * or `DUST_CONVERSION_FAILED`. Try later on `PreconditionFailedError` with
     * `DUST_WINDOW_ACTIVE` (the account converted within 6 hours or a conversion is processing)
     * or `DUST_DAILY_LIMIT`; retry shortly on `RateLimitError` with `DUST_BUSY`. A key or quote
     * already used for another conversion throws
     * `AlreadyExistsError` (`IDEMPOTENCY_CONFLICT`); on `ServiceUnavailableError` retry the
     * same request. Codes are on the error's `detail` (service `internal_transfer`).
     */
    async create(
        input: CreateDustConversionInput,
        options?: PolyesterRequestOptions,
    ): Promise<DustConversion> {
        const request = parse(
            CreateDustConversionInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.createDustConversion(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(DustConversionSchema, response.conversion);
    }

    /** Reads one of the account's conversions; an unknown one throws `ResourceNotFoundError`. */
    async get(
        input: GetDustConversionInput,
        options?: PolyesterRequestOptions,
    ): Promise<DustConversion> {
        const request = parse(
            GetDustConversionInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.getDustConversion(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(DustConversionSchema, response.conversion);
    }

    /** Lists the account's conversions, newest first. */
    async list(
        input: ListDustConversionsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListDustConversionsResult> {
        const request = parse(
            ListDustConversionsInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.listDustConversions(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(ListDustConversionsResultSchema, response);
    }
}
