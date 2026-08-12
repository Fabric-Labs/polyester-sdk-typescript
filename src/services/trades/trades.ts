import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import { GetUserTradesInputSchema, createUserTradeSchema, type Trade } from "./trades.schemas.js";

interface SubscribeTradesInput extends BaseSubscribeInput<Trade> {
    accountId: string;
}

/**
 * Reads and streams authenticated user trade fills.
 */
export class TradesService {
    #client: Client<typeof Proto.OrdersReadService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #userTradeSchema: ReturnType<typeof createUserTradeSchema>;

    constructor(
        transport: Transport,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.OrdersReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#userTradeSchema = createUserTradeSchema(scales);
    }

    /**
     * Returns user trades for the resolved root account or subaccount, supporting symbol, side, time range, limit, and page token filters. Results include the next page token from GetUserTrades.
     */
    async list(
        input: v.InferInput<typeof GetUserTradesInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ trades: Trade[]; nextPageToken: string }> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(GetUserTradesInputSchema, resolved);
        const res = await this.#client.getUserTrades(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            trades: parse(v.array(this.#userTradeSchema), res.trades),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Subscribes to private user trade updates on private:spot:trades:{accountId}:proto and emits parsed fills.
     */
    subscribe(input: SubscribeTradesInput) {
        const channel = `private:spot:trades:${input.accountId}:proto`;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.UserTradeSchema,
            onPublication: (data) => {
                gate.run(() => {
                    const trade = parse(this.#userTradeSchema, data);
                    input.onEvent(trade);
                });
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
