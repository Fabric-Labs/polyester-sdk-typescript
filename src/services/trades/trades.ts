import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { UserTradeSchema, GetUserTradesInputSchema, type Trade } from "./trades.schemas.js";

interface SubscribeTradesInput extends BaseSubscribeInput<Trade> {
    accountId: string;
}

export class TradesService {
    #client: Client<typeof Proto.OrdersReadService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.OrdersReadService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * List trades for a specific account or subaccount.
     */
    async list(
        input: v.InferInput<typeof GetUserTradesInputSchema> = {},
    ): Promise<{ trades: Trade[]; nextPageToken: string }> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetUserTradesInputSchema, resolved);
        const res = await this.#client.getUserTrades(removeUndefined(validatedInput));
        return {
            trades: v.parse(v.array(UserTradeSchema), res.trades),
            nextPageToken: res.nextPageToken,
        };
    }

    subscribe(input: SubscribeTradesInput) {
        const channel = `private:spot:trades:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.UserTradeSchema,
            onPublication: (data) => {
                const trade = v.parse(UserTradeSchema, data);
                input.onEvent(trade);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
