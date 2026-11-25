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
    CancelSwapInputSchema,
    CreateSwapInputSchema,
    GetSwapInputSchema,
    ListSwapsInputSchema,
    ListSwapsResultSchema,
    QuoteSwapInputSchema,
    SwapQuoteSchema,
    SwapSchema,
    type CancelSwapInput,
    type CreateSwapInput,
    type GetSwapInput,
    type ListSwapsInput,
    type ListSwapsResult,
    type QuoteSwapInput,
    type Swap,
    type SwapQuote,
} from "./swap.schemas.js";

/**
 * Converts one asset of an account's Trading balance into another with immediate-or-cancel spot
 * orders on that account, at its spot taker fee on each market and no other fee. The route is the
 * direct market, or two markets through USDT or USDC; `execution` trades at market or as a TWAP
 * over up to 24 hours. Every part that trades nets at least the accepted `minAmountOut` rate;
 * anything that cannot stays on the account. Only an order the exchange accepts late, under
 * severe delay, can pay a later scheduled fee and net less; the swap then ends `failed` with
 * reason `minimum_not_met`, and its amounts show what actually traded. Sized by source amount only. Flow: `quote`, then
 * `create` with the same terms and the quote's `minAmountOut` and `expiresAt`, then `get` until
 * `isTerminal`; a market swap usually finishes within seconds, a TWAP by its deadline. `cancel`
 * stops a swap that has not ended, and `list` finds an account's swaps newest first.
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
     * nothing. `AMOUNT_OUT_OF_RANGE` throws `ValidationError` with the current `minAmount` (for a
     * TWAP, the least amount that quotes for its schedule) and `maxAmount` on its `detail` when
     * known; `ROUTE_UNSUPPORTED`, `DIRECTION_UNSUPPORTED` and
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
     * Creates the swap for `idempotencyKey` and starts executing it, after re-pricing: it is
     * created only while the quote is unexpired and `minAmountOut` is achievable. The result is
     * usually still `executing`; follow it with `get`. Keys starting `aw:` are refused
     * (`ValidationError`): they are reserved for auto-withdraw conversions.
     *
     * Idempotent per caller and key: an unknown outcome (`TimeoutError`, `ServiceUnavailableError`,
     * `NetworkError`, all `retryable`) is settled by calling `create` again with the same input,
     * which returns the same swap, or by `get({ idempotencyKey })`. The `execution` is part of the
     * idempotent terms. Pass `account` explicitly
     * (e.g. from the quote's `subaccountId`) so a retry after the active subaccount changes sends
     * the same request. Reusing the key with
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

    /**
     * Cancels one of the caller's swaps that has not ended. No new slice or first-leg order starts;
     * what was already placed finishes, and nothing that traded is undone. The swap stays
     * `canceling` (or `reconciling` while confirming an order) until terminal (`canceled` with
     * reason `user_canceled`, or the outcome it would have had if nothing was left to stop); keep
     * polling `get` until `isTerminal`.
     *
     * Idempotent once recorded: repeating the request returns the swap with its original
     * `cancelRequestedAt`, so an unknown outcome (`TimeoutError`, `ServiceUnavailableError`,
     * `NetworkError`) is resolved by retrying. Throws `PreconditionFailedError` with
     * `SWAP_ALREADY_FINAL` (with `swapId` on `detail`) when the swap ended without a cancel, or
     * `SWAP_NOT_CANCELABLE` for an auto-withdraw conversion; `ResourceNotFoundError`
     * (`SWAP_NOT_FOUND`) when unknown.
     */
    async cancel(input: CancelSwapInput, options?: PolyesterRequestOptions): Promise<Swap> {
        const request = parse(CancelSwapInputSchema, input);
        const response = await this.#client.cancelSwap(request, toConnectCallOptions(options));
        return parse(SwapSchema, response.swap);
    }

    /**
     * Lists the caller's swaps funded by the resolved account, newest first. Pass `openOnly: true`
     * to list only swaps that have not ended (`isTerminal` false). Inactive subaccounts can still
     * be listed so their open swaps can be found and canceled. Pass the returned `nextPageToken`
     * as `pageToken` with the same account and `openOnly` to continue; an empty `nextPageToken`
     * means no more swaps.
     */
    async list(
        input: ListSwapsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListSwapsResult> {
        const request = parse(
            ListSwapsInputSchema,
            resolveAccountScopedInput(input, this.#resolver),
        );
        const response = await this.#client.listSwaps(request, toConnectCallOptions(options));
        return parse(ListSwapsResultSchema, response);
    }
}
