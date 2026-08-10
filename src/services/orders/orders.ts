import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { publicationHandlerErrorContext } from "../../shared/subscription-errors.js";
import * as v from "valibot";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { createReadyGate, type SdkScales } from "../../shared/decimal-surface.js";
import {
    OpenOrdersInputSchema,
    OrderHistoryInputSchema,
    type NewOrderInput,
    createNewOrderInputSchema,
    CancelOrderInputSchema,
    CancelOrderResultSchema,
    type CancelOrderResult,
    CancelAllOrdersInputSchema,
    CancelAllOrdersResponseSchema,
    type CancelAllOrdersResponse,
    type Order,
    GetOrderDetailsInputSchema,
    createCreateOrderResultSchema,
    createPreviewOrderResultSchema,
    type PreviewOrderResult,
    type ModifyOrderInput,
    assertKnownModifyOrderInputKeys,
    createModifyOrderInputSchema,
    ModifyOrderResultSchema,
    type CreateOrderResult,
    type ModifyOrderResult,
    type OrderDetails,
    createOrderSchema,
    createOrderDetailsSchema,
    CancelAllAfterInputSchema,
    CancelAllAfterResultSchema,
    type CancelAllAfterInput,
    type CancelAllAfterResult,
    BatchCancelOrdersInputSchema,
    BatchCancelOrdersResultSchema,
    type BatchCancelOrdersInput,
    type BatchCancelOrdersResult,
    createBatchCreateOrdersResultSchema,
    type BatchCreateOrdersInput,
    type BatchCreateOrdersResult,
    BatchReplaceOrdersResultSchema,
    type BatchReplaceOrdersInput,
    type BatchReplaceOrdersResult,
    GetBatchReplaceStatusInputSchema,
    GetBatchReplaceStatusResultSchema,
    type GetBatchReplaceStatusInput,
    type GetBatchReplaceStatusResult,
    assertKnownBatchReplaceOrderItemInputKeys,
    createBatchCreateOrdersInputSchema,
    createBatchReplaceOrdersInputSchema,
} from "./orders.schemas.js";

function hasKnownOrderSymbol(scales: SdkScales, order: { symbolId: number }): boolean {
    try {
        scales.baseQty(order.symbolId);
        return true;
    } catch {
        return false;
    }
}

interface SubscribeOrdersInput extends BaseSubscribeInput<Order> {
    accountId: string;
}

function createMutationRequestId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
    );
}

function assertBatchResultCount(operation: string, requested: number, returned: number): void {
    if (requested !== returned) {
        throw new Error(
            `${operation} returned ${returned} results for ${requested} requested items.`,
        );
    }
}

/**
 * Manages account-scoped spot orders across read, write, and realtime order update surfaces.
 */
export class OrdersService {
    #readClient: Client<typeof ProtoRead.OrdersReadService>;
    #writeClient: Client<typeof ProtoWrite.OrdersService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #orderSchema: ReturnType<typeof createOrderSchema>;
    #orderDetailsSchema: ReturnType<typeof createOrderDetailsSchema>;
    #newOrderInputSchema: ReturnType<typeof createNewOrderInputSchema>;
    #modifyOrderInputSchema: ReturnType<typeof createModifyOrderInputSchema>;
    #batchCreateOrdersInputSchema: ReturnType<typeof createBatchCreateOrdersInputSchema>;

    constructor(
        transport: Transport,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#readClient = createClient(ProtoRead.OrdersReadService, transport);
        this.#writeClient = createClient(ProtoWrite.OrdersService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#orderSchema = createOrderSchema(scales);
        this.#orderDetailsSchema = createOrderDetailsSchema(scales);
        this.#newOrderInputSchema = createNewOrderInputSchema(scales);
        this.#modifyOrderInputSchema = createModifyOrderInputSchema(scales);
        this.#batchCreateOrdersInputSchema = createBatchCreateOrdersInputSchema(scales);
    }

    /**
     * Returns open orders for the resolved root account or subaccount, with optional symbol, trigger ID, side, pagination, and attached-risk inclusion filters. Results include the next page token returned by GetOpenOrders.
     */
    async listOpen(
        input: v.InferInput<typeof OpenOrdersInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OpenOrdersInputSchema, resolved);
        const res = await this.#readClient.getOpenOrders(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            orders: v.parse(
                v.array(this.#orderSchema),
                res.orders.filter((order) => hasKnownOrderSymbol(this.#scales, order)),
            ),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Returns historical orders for the resolved account scope, supporting symbol, trigger ID, side, status, time range, pagination, and attached-risk filters. Results are paginated with the backend nextPageToken.
     */
    async listHistory(
        input: v.InferInput<typeof OrderHistoryInputSchema> = {},
        options?: PolyesterRequestOptions,
    ): Promise<{ orders: Order[]; nextPageToken: string }> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(OrderHistoryInputSchema, resolved);
        const res = await this.#readClient.getOrderHistory(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        return {
            orders: v.parse(
                v.array(this.#orderSchema),
                res.orders.filter((order) => hasKnownOrderSymbol(this.#scales, order)),
            ),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Evaluates one complete order intent against current market, policy, risk, and balance state without creating an order, reserving funds, or claiming its client order ID.
     */
    async preview(
        input: NewOrderInput,
        options?: PolyesterRequestOptions,
    ): Promise<PreviewOrderResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = v.parse(this.#newOrderInputSchema, resolved);
        const response = await this.#writeClient.previewOrder(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(createPreviewOrderResultSchema(this.#scales, input.symbol), response);
    }

    /**
     * Places a spot order with an explicit market-IOC, limit-GTC, limit-IOC, or limit-FOK execution policy and optional attached risk controls. clientOrderId is the caller-controlled idempotency key and should be reused only for the same logical order.
     */
    async create(
        input: NewOrderInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateOrderResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(this.#newOrderInputSchema, resolved);
        const requestPayload = removeUndefined(validatedInput);
        const res = await this.#writeClient.createOrder(
            requestPayload,
            toConnectCallOptions(options),
        );
        return v.parse(createCreateOrderResultSchema(this.#scales, input.symbol), res);
    }

    /**
     * Places 1–20 spot orders in one best-effort request. Results preserve item order and report admission as accepted or rejected; accepted orders still require lifecycle reconciliation. Supply a clientOrderId for each item and a stable requestId when an ambiguous batch may be retried.
     */
    async batchCreate(
        input: BatchCreateOrdersInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchCreateOrdersResult> {
        await this.#scales.ready();
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const request = v.parse(this.#batchCreateOrdersInputSchema, resolved);
        const response = await this.#writeClient.batchCreateOrders(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        const result = v.parse(
            createBatchCreateOrdersResultSchema(
                this.#scales,
                input.items.map((item) => item.symbol),
            ),
            response,
        );
        assertBatchResultCount("batchCreate", input.items.length, result.results.length);
        return result;
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
     * Cancels 1–50 explicit orders in one best-effort request. Results preserve item order and acknowledge cancellation admission rather than final order state. Supply a stable requestId when an ambiguous batch may be retried.
     */
    async batchCancel(
        input: BatchCancelOrdersInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchCancelOrdersResult> {
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const request = v.parse(BatchCancelOrdersInputSchema, resolved);
        const response = await this.#writeClient.batchCancelOrders(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        const result = v.parse(BatchCancelOrdersResultSchema, response);
        assertBatchResultCount("batchCancel", input.items.length, result.results.length);
        return result;
    }

    /**
     * Applies a price, quantity, client id, or attached-risk patch to one open order using the backend modify behavior policy. A requestId is generated when omitted; provide a stable value when retrying the same logical modification.
     */
    async modify(
        input: ModifyOrderInput,
        options?: PolyesterMutationOptions,
    ): Promise<ModifyOrderResult> {
        await this.#scales.ready();
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        assertKnownModifyOrderInputKeys(resolved);
        const validated = v.parse(this.#modifyOrderInputSchema, resolved);
        const res = await this.#writeClient.modifyOrder(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(ModifyOrderResultSchema, res);
    }

    /**
     * Replaces 1–50 same-symbol orders and returns an index-stable durable admission receipt. Reuse requestId only when retrying the same logical batch; use the returned batchRequestId for later status reads.
     */
    async batchReplace(
        input: BatchReplaceOrdersInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchReplaceOrdersResult> {
        await this.#scales.ready();
        for (const item of input.items) {
            assertKnownBatchReplaceOrderItemInputKeys(item);
        }
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const request = v.parse(
            createBatchReplaceOrdersInputSchema(this.#scales, input.symbolId),
            resolved,
        );
        const response = await this.#writeClient.batchReplaceOrders(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        const result = v.parse(BatchReplaceOrdersResultSchema, response);
        assertBatchResultCount("batchReplace", input.items.length, result.results.length);
        return result;
    }

    /**
     * Reads the durable per-item execution status for a batch replacement receipt.
     */
    async getBatchReplaceStatus(
        input: GetBatchReplaceStatusInput,
        options?: PolyesterRequestOptions,
    ): Promise<GetBatchReplaceStatusResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = v.parse(GetBatchReplaceStatusInputSchema, resolved);
        const response = await this.#readClient.getBatchReplaceStatus(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(GetBatchReplaceStatusResultSchema, response);
    }

    /**
     * Cancels all matching open orders for the resolved account scope, optionally narrowed by symbol and side, with dry-run preview. A requestId is generated when omitted; provide a stable value when retrying the same logical bulk cancellation.
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
     * Arms, refreshes, or disables the account dead-man switch. timeoutSec 0 disables it; 10–120 arms it. Generate a new requestId for each deliberate heartbeat, but reuse the same ID when retrying one ambiguous heartbeat.
     */
    async cancelAllAfter(
        input: CancelAllAfterInput,
        options?: PolyesterMutationOptions,
    ): Promise<CancelAllAfterResult> {
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const request = v.parse(CancelAllAfterInputSchema, resolved);
        const response = await this.#writeClient.cancelAllAfter(
            removeUndefined(request),
            toConnectCallOptions(options),
        );
        return v.parse(CancelAllAfterResultSchema, response);
    }

    /**
     * Fetches one order by id or client order id and returns its order, trades, and transfer details when found. Returns null when the backend response has no order.
     */
    async getDetails(
        input: v.InferInput<typeof GetOrderDetailsInputSchema>,
        options?: PolyesterRequestOptions,
    ): Promise<OrderDetails | null> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(GetOrderDetailsInputSchema, resolved);
        const res = await this.#readClient.getOrder(
            removeUndefined(validatedInput),
            toConnectCallOptions(options),
        );
        if (!res.order) return null;
        return v.parse(this.#orderDetailsSchema, res);
    }

    /**
     * Subscribes to private order updates on private:spot:orders:{accountId}:proto and emits parsed order records until the returned unsubscribe function is called.
     */
    subscribe(input: SubscribeOrdersInput): () => void {
        const channel = `private:spot:orders:${input.accountId}:proto`;
        const gate = createReadyGate(
            () => this.#scales.ready(),
            (error) => input.onError?.(publicationHandlerErrorContext(channel, error)),
        );
        return this.#realtime.connectProtoChannel({
            channel,
            schema: ProtoRead.OrderSchema,
            onPublication: (data) => {
                gate.run(() => {
                    const order = v.parse(this.#orderSchema, data);
                    input.onEvent(order);
                });
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
