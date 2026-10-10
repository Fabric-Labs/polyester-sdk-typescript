import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/swap/quickswap/v1/quickswap_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    CreateQuickSwapInputSchema,
    GetQuickSwapInputSchema,
    LookupQuickSwapInputSchema,
    QuickSwapResultSchema,
    QuoteQuickSwapInputSchema,
    QuoteQuickSwapResultSchema,
    type CreateQuickSwapInput,
    type GetQuickSwapInput,
    type LookupQuickSwapInput,
    type QuickSwap,
    type QuickSwapQuote,
    type QuoteQuickSwapInput,
} from "./quickswap.schemas.js";

/**
 * Broker-only QuickSwap API: swaps an end user's external deposit into external
 * withdrawals. Requires a `broker-api-key` auth provider on a server client;
 * the broker key is a server credential and must never reach a browser.
 *
 * Failures carry a `quickswap` error detail whose `code` names the reason, for
 * example `AMOUNT_OUT_OF_RANGE` (with `minDepositAmount`/`maxDepositAmount`),
 * `IDEMPOTENCY_CONFLICT` or `ADDRESS_UNAVAILABLE` (both with `swapId`).
 */
export class QuickSwapService {
    #client: Client<typeof Proto.QuickSwapService>;

    constructor(transports: AuthApiTransports) {
        this.#client = createClient(Proto.QuickSwapService, transports.authApi);
    }

    /**
     * Prices terms without creating a QuickSwap or reserving a deposit address. A
     * non-zero `intermediateAssetId` means `create` needs a `refund` target. The
     * quote is indicative; `create` prices the terms again.
     */
    async quote(
        input: QuoteQuickSwapInput,
        options?: PolyesterRequestOptions,
    ): Promise<QuickSwapQuote> {
        const request = parse(QuoteQuickSwapInputSchema, input);
        const response = await this.#client.quoteQuickSwap(request, toConnectCallOptions(options));
        return parse(QuoteQuickSwapResultSchema, response).quote;
    }

    /**
     * Creates, or returns, the QuickSwap bound to `idempotencyKey`. Repeating the
     * same input returns the same QuickSwap, quote and deposit address, so resolve
     * any unknown outcome (timeout, `ADDRESS_UNAVAILABLE`) by repeating it
     * unchanged or by calling `lookup`. Different input under a used key fails
     * with `IDEMPOTENCY_CONFLICT`.
     */
    async create(
        input: CreateQuickSwapInput,
        options?: PolyesterRequestOptions,
    ): Promise<QuickSwap> {
        const request = parse(CreateQuickSwapInputSchema, input);
        const response = await this.#client.createQuickSwap(request, toConnectCallOptions(options));
        return parse(QuickSwapResultSchema, response).quickSwap;
    }

    /**
     * Returns the current state of one of the broker's QuickSwaps. Poll at most
     * once every 5 seconds per QuickSwap, and stop once `isTerminal` is true.
     */
    async get(input: GetQuickSwapInput, options?: PolyesterRequestOptions): Promise<QuickSwap> {
        const request = parse(GetQuickSwapInputSchema, input);
        const response = await this.#client.getQuickSwap(request, toConnectCallOptions(options));
        return parse(QuickSwapResultSchema, response).quickSwap;
    }

    /**
     * Returns the QuickSwap created with `idempotencyKey`, for example to resolve
     * a `create` whose outcome is unknown. Fails with `SWAP_NOT_FOUND` when the
     * key created nothing.
     */
    async lookup(
        input: LookupQuickSwapInput,
        options?: PolyesterRequestOptions,
    ): Promise<QuickSwap> {
        const request = parse(LookupQuickSwapInputSchema, input);
        const response = await this.#client.getQuickSwap(request, toConnectCallOptions(options));
        return parse(QuickSwapResultSchema, response).quickSwap;
    }
}
