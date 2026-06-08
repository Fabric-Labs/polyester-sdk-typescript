import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createUserTradeSchema, GetUserTradesInputSchema, type Trade } from "./trades.schemas.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

interface SubscribeTradesInput extends BaseSubscribeInput<Trade> {
    accountId: string;
}

/**
 * Reads and streams authenticated user trade fills.
 */
export class TradesService {
    #client: Client<typeof Proto.OrdersReadService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;
    #catalog: CatalogReader;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        resolver?: SubaccountResolver,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.OrdersReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#catalog = catalog;
    }

    /**
     * Returns user trades for the resolved root account or subaccount, supporting symbol, side, time range, limit, and page token filters. Results include the next page token from GetUserTrades.
     */
    async list(
        input: v.InferInput<typeof GetUserTradesInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ trades: Trade[]; nextPageToken: string }> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetUserTradesInputSchema, resolved);
        const res = await this.#client.getUserTrades(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            trades: v.parse(v.array(createUserTradeSchema(this.#catalog.snapshot())), res.trades),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Subscribes to private user trade updates on private:spot:trades:{accountId}:proto and emits parsed fills.
     */
    subscribe(input: SubscribeTradesInput) {
        const channel = `private:spot:trades:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.UserTradeSchema,
            onPublication: (data) => {
                const trade = v.parse(createUserTradeSchema(this.#catalog.snapshot()), data);
                input.onEvent(trade);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
