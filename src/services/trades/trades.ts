import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import {
    GetUserTradesInputSchema,
    createUserTradeSchema,
    type GetUserTradesInput,
    type Trade,
} from "./trades.schemas.js";

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
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.OrdersReadService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#userTradeSchema = createUserTradeSchema(scales);
    }

    /**
     * Returns user trades for the resolved root account or subaccount, supporting symbol, side, time range, limit, page token, and after-match-ID replay cursor filters. The `afterMatchId` cursor requires `symbolId`, enforced at the type and validation level. Results include the next page token from GetUserTrades.
     */
    async list(
        input: GetUserTradesInput = {},
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
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.UserTradeSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                const trade = parse(this.#userTradeSchema, data);
                input.onEvent(trade);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
