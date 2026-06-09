import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { createTradesSchemas, GetUserTradesInputSchema, type Trade } from "./trades.schemas.js";
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
    #schemas: ReturnType<typeof createTradesSchemas>;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        resolver?: SubaccountResolver,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.OrdersReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#schemas = createTradesSchemas(catalog);
    }

    /**
     * Returns user trades for the resolved root account or subaccount, supporting symbol, side, time range, limit, and page token filters. Results include the next page token from GetUserTrades.
     */
    async list(
        input: v.InferInput<typeof GetUserTradesInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ trades: Trade[]; nextPageToken: string }> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetUserTradesInputSchema, resolved);
        const res = await this.#client.getUserTrades(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        const schemas = this.#schemas.current();
        return {
            trades: v.parse(v.array(schemas.userTrade), res.trades),
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
                const schemas = this.#schemas.current();
                const trade = v.parse(schemas.userTrade, data);
                input.onEvent(trade);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
