import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import { connectProtoChannel } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { UserTradeSchema, GetUserTradesInputSchema, type Trade } from "./trades.schemas.js";

interface SubscribeTradesInput extends BaseSubscribeInput<Trade> {
    accountId: string;
}

export class TradesService {
    #client: Client<typeof Proto.OrdersReadService>;
    #resolver?: SubAccountResolver;

    constructor(transport: Transport, resolver?: SubAccountResolver) {
        this.#client = createClient(Proto.OrdersReadService, transport);
        this.#resolver = resolver;
    }

    async list(
        input: v.InferInput<typeof GetUserTradesInputSchema> = {},
    ): Promise<{ trades: Trade[]; nextPageToken: string }> {
        const resolved = resolveSubAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetUserTradesInputSchema, resolved);
        const res = await this.#client.getUserTrades(removeUndefined(validatedInput));
        return {
            trades: v.parse(v.array(UserTradeSchema), res.trades),
            nextPageToken: res.nextPageToken,
        };
    }

    subscribe(input: SubscribeTradesInput) {
        const channel = `private:spot:trades:${input.accountId}:proto`;
        return connectProtoChannel({
            channel,
            schema: Proto.UserTradeSchema,
            onPublication: (data) => {
                const trade = v.parse(UserTradeSchema, data);
                input.onEvent(trade);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
        });
    }
}
