import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    OpenOrdersInputSchema,
    OrderHistoryInputSchema,
    NewOrderInputSchema,
    OrderSchema,
    CancelOrderInputSchema,
    CancelAllOrdersInputSchema,
    CancelAllOrdersResponseSchema,
    type CancelAllOrdersResponse,
    type Order,
    GetOrderInputSchema,
    GetOrderResponseSchema,
    CreateOrderResultSchema,
    ModifyOrderInputSchema,
    ModifyOrderResultSchema,
    type CreateOrderResult,
    type ModifyOrderResult,
} from "./orders.schemas.js";

interface SubscribeOrdersInput extends BaseSubscribeInput<Order> {
    accountId: string;
}

type GetOrderResponse = v.InferOutput<typeof GetOrderResponseSchema>;

export class OrdersService {
    #readClient: Client<typeof ProtoRead.OrdersReadService>;
    #writeClient: Client<typeof ProtoWrite.OrdersService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#readClient = createClient(ProtoRead.OrdersReadService, transport);
        this.#writeClient = createClient(ProtoWrite.OrdersService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    async listOpen(
        input: v.InferInput<typeof OpenOrdersInputSchema> = {},
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OpenOrdersInputSchema, resolved);
        const res = await this.#readClient.getOpenOrders(removeUndefined(validatedInput));
        return {
            orders: v.parse(v.array(OrderSchema), res.orders),
            nextPageToken: res.nextPageToken,
        };
    }

    async listHistory(
        input: v.InferInput<typeof OrderHistoryInputSchema> = {},
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OrderHistoryInputSchema, resolved);
        const res = await this.#readClient.getOrderHistory(removeUndefined(validatedInput));
        return {
            orders: v.parse(v.array(OrderSchema), res.orders),
            nextPageToken: res.nextPageToken,
        };
    }

    async create(input: v.InferInput<typeof NewOrderInputSchema>): Promise<CreateOrderResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(NewOrderInputSchema, resolved);
        const requestPayload = removeUndefined(validatedInput);
        const res = await this.#writeClient.createOrder(requestPayload);
        return v.parse(CreateOrderResultSchema, res);
    }

    async cancel(input: v.InferInput<typeof CancelOrderInputSchema>) {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);

        const validated = v.parse(CancelOrderInputSchema, resolved);

        return await this.#writeClient.cancelOrder({
            key: {
                case: "orderId",
                value: validated.orderId,
            },
            symbolId: validated.symbolId,
            subaccountId: validated.subaccountId,
        });
    }

    async modify(input: v.InferInput<typeof ModifyOrderInputSchema>): Promise<ModifyOrderResult> {
        const resolved = {
            ...resolveSubaccountScopedInput(input, this.#resolver),
            requestId:
                input.requestId ??
                globalThis.crypto?.randomUUID?.() ??
                `req_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        };
        const validated = v.parse(ModifyOrderInputSchema, resolved);
        const res = await this.#writeClient.modifyOrder(removeUndefined(validated));
        return v.parse(ModifyOrderResultSchema, res);
    }

    async cancelAll(
        input: v.InferInput<typeof CancelAllOrdersInputSchema>,
    ): Promise<CancelAllOrdersResponse> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(CancelAllOrdersInputSchema, resolved);
        const res = await this.#writeClient.cancelAllOrders(removeUndefined(validated));
        return v.parse(CancelAllOrdersResponseSchema, res);
    }

    async get(input: v.InferInput<typeof GetOrderInputSchema>): Promise<GetOrderResponse | null> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetOrderInputSchema, resolved);
        const res = await this.#readClient.getOrder(removeUndefined(validatedInput));
        return v.parse(GetOrderResponseSchema, res);
    }

    subscribe(input: SubscribeOrdersInput): () => void {
        const channel = `private:spot:orders:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: ProtoRead.OrderSchema,
            onPublication: (data) => {
                const order = v.parse(OrderSchema, data);
                input.onEvent(order);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
        });
    }
}
