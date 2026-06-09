import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    OpenOrdersInputSchema,
    OrderHistoryInputSchema,
    type NewOrderInput,
    NewOrderInputSchema,
    CancelOrderInputSchema,
    CancelOrderResultSchema,
    type CancelOrderResult,
    CancelAllOrdersInputSchema,
    CancelAllOrdersResponseSchema,
    type CancelAllOrdersResponse,
    type Order,
    GetOrderDetailsInputSchema,
    CreateOrderResultSchema,
    type ModifyOrderInput,
    ModifyOrderInputSchema,
    ModifyOrderResultSchema,
    type CreateOrderResult,
    type ModifyOrderResult,
    type OrderDetails,
    OrderSchema,
    OrderDetailsSchema,
} from "./orders.schemas.js";

interface SubscribeOrdersInput extends BaseSubscribeInput<Order> {
    accountId: string;
}

function createMutationRequestId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
    );
}

/**
 * Manages account-scoped spot orders across read, write, and realtime order update surfaces.
 */
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

    /**
     * Returns open orders for the resolved root account or subaccount, with optional symbol, side, pagination, and attached-risk inclusion filters. Results include the next page token returned by GetOpenOrders.
     */
    async listOpen(
        input: v.InferInput<typeof OpenOrdersInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OpenOrdersInputSchema, resolved);
        const res = await this.#readClient.getOpenOrders(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            orders: v.parse(v.array(OrderSchema), res.orders),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Returns historical orders for the resolved account scope, supporting symbol, side, status, time range, pagination, and attached-risk filters. Results are paginated with the backend nextPageToken.
     */
    async listHistory(
        input: v.InferInput<typeof OrderHistoryInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OrderHistoryInputSchema, resolved);
        const res = await this.#readClient.getOrderHistory(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            orders: v.parse(v.array(OrderSchema), res.orders),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Places a spot order with side, type, quantity, optional price/slippage fields, fee source, STP mode, and optional attached take-profit, stop-loss, or trailing-stop risk controls. clientOrderId is the caller-controlled idempotency key and should be reused only for the same logical order.
     */
    async create(
        input: NewOrderInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateOrderResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(NewOrderInputSchema, resolved);
        const requestPayload = removeUndefined(validatedInput);
        const res = await this.#writeClient.createOrder(
            requestPayload,
            toConnectCallOptions(options),
        );
        return v.parse(CreateOrderResultSchema, res);
    }

    /**
     * Cancels one open order in the resolved account scope by order id or client order id, with optional symbol routing. Returns the backend cancellation status, order id, and server timestamp fields.
     */
    async cancel(
        input: v.InferInput<typeof CancelOrderInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<CancelOrderResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);

        const validated = v.parse(CancelOrderInputSchema, resolved);

        const res = await this.#writeClient.cancelOrder(
            {
                key: validated.key,
                symbolId: validated.symbolId,
                subaccountId: validated.subaccountId,
            },
            toConnectCallOptions(options),
        );
        return v.parse(CancelOrderResultSchema, res);
    }

    /**
     * Applies a price, quantity, client id, or attached-risk patch to one open order using the backend modify behavior policy. A requestId is generated when omitted; provide a stable value when retrying the same logical modification.
     */
    async modify(
        input: ModifyOrderInput,
        options?: PolyesterMutationOptions,
    ): Promise<ModifyOrderResult> {
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const validated = v.parse(ModifyOrderInputSchema, resolved);
        const res = await this.#writeClient.modifyOrder(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(ModifyOrderResultSchema, res);
    }

    /**
     * Cancels all matching open orders for the resolved account scope, optionally narrowed by symbol and side, with dry-run and max-order safeguards. A requestId is generated when omitted; provide a stable value when retrying the same logical bulk cancellation.
     */
    async cancelAll(
        input: v.InferInput<typeof CancelAllOrdersInputSchema>,
        options?: PolyesterMutationOptions,
    ): Promise<CancelAllOrdersResponse> {
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const validated = v.parse(CancelAllOrdersInputSchema, resolved);
        const res = await this.#writeClient.cancelAllOrders(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(CancelAllOrdersResponseSchema, res);
    }

    /**
     * Fetches one order by id or client order id and returns its order, trades, and transfer details when found. Returns null when the backend response has no order.
     */
    async getDetails(
        input: v.InferInput<typeof GetOrderDetailsInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<OrderDetails | null> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetOrderDetailsInputSchema, resolved);
        const res = await this.#readClient.getOrder(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!res.order) return null;
        return v.parse(OrderDetailsSchema, res);
    }

    /**
     * Subscribes to private order updates on private:spot:orders:{accountId}:proto and emits parsed order records until the returned unsubscribe function is called.
     */
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
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
