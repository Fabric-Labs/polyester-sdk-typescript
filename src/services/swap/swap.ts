import { createClient, type Client } from "@connectrpc/connect";
import * as Proto from "../../gen/swap/v1/swap_pb.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { resolveAccountScopedInput, type SubaccountResolver } from "../subaccount-resolver.js";
import {
    CreateSwapInputSchema,
    GetSwapInputSchema,
    QuoteSwapInputSchema,
    SwapQuoteSchema,
    SwapSchema,
    type CreateSwapInput,
    type GetSwapInput,
    type QuoteSwapInput,
    type Swap,
    type SwapQuote,
} from "./swap.schemas.js";

/**
 * Converts one asset of an account's Trading balance into another with immediate-or-cancel spot
 * orders on that account, at its spot taker fee and no other fee. Every part that trades nets at
 * least the accepted `minAmountOut` rate; anything that cannot stays on the account. Sized by
 * source amount only. Flow: `quote`, then `create` with the quote's `minAmountOut` and
 * `expiresAt`, then `get` until `isTerminal`; a direct swap usually finishes within seconds.
 *
 * Needs a session or a signed API key with the `swap` policy action; subaccount members need the
 * `swap` permission. The swap's orders also follow the subaccount's spot trading policy.
 * Rejection codes are on the error's `detail` (service `swap`). Available on devnet only.
 */
export class SwapService {
    #client: Client<typeof Proto.SwapService>;
    #resolver?: SubaccountResolver;

    constructor(transports: AuthApiTransports, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.SwapService, transports.authApi);
        this.#resolver = resolver;
    }

    /**
     * Prices a swap against current order-book depth and the account's taker fee. Reserves
     * nothing. `AMOUNT_OUT_OF_RANGE` throws `ValidationError` with the current `minAmount` and
     * `maxAmount` on its `detail` when known; `ROUTE_UNSUPPORTED`, `DIRECTION_UNSUPPORTED` and
     * `PROTECTION_UNACHIEVABLE` throw `PreconditionFailedError`; `QUOTE_UNAVAILABLE` throws
     * `ServiceUnavailableError` (retry later).
     */
    async quote(input: QuoteSwapInput, options?: PolyesterRequestOptions): Promise<SwapQuote> {
        const request = parse(
            QuoteSwapInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.quoteSwap(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(SwapQuoteSchema, response.quote);
    }

    /**
     * Creates the swap for `idempotencyKey` and executes it at once, after re-pricing: it is
     * created only while the quote is unexpired and `minAmountOut` is achievable. The result is
     * usually still `executing`; follow it with `get`.
     *
     * Idempotent per caller and key: an unknown outcome (`TimeoutError`, `ServiceUnavailableError`,
     * `NetworkError`, all `retryable`) is settled by calling `create` again with the same input,
     * which returns the same swap, or by `get({ idempotencyKey })`. Reusing the key with
     * different input throws `AlreadyExistsError` (`IDEMPOTENCY_CONFLICT`, with the original
     * `swapId` on `detail`). `QUOTE_EXPIRED` and `PROTECTION_UNACHIEVABLE` throw
     * `PreconditionFailedError` and create nothing: quote again with a new key.
     */
    async create(input: CreateSwapInput, options?: PolyesterRequestOptions): Promise<Swap> {
        const request = parse(
            CreateSwapInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.createSwap(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return parse(SwapSchema, response.swap);
    }

    /**
     * Reads one of the caller's swaps by `swapId` or the `idempotencyKey` it was created with.
     * An unknown one throws `ResourceNotFoundError` (`SWAP_NOT_FOUND`).
     */
    async get(input: GetSwapInput, options?: PolyesterRequestOptions): Promise<Swap> {
        const request = parse(GetSwapInputSchema, input);
        const response = await this.#client.getSwap(request, toConnectCallOptions(options));
        return parse(SwapSchema, response.swap);
    }
}
