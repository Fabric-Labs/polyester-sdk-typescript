import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { connectProtoChannel } from "../../realtime/client.js";
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

type GetOrderResponse = z.output<typeof GetOrderResponseSchema>;

export class OrdersService {
	#readClient: Client<typeof ProtoRead.OrdersReadService>;
	#writeClient: Client<typeof ProtoWrite.OrdersService>;
	#resolver?: SubAccountResolver;

	constructor(transport: Transport, resolver?: SubAccountResolver) {
		this.#readClient = createClient(ProtoRead.OrdersReadService, transport);
		this.#writeClient = createClient(ProtoWrite.OrdersService, transport);
		this.#resolver = resolver;
	}

	async listOpen(
		input: z.input<typeof OpenOrdersInputSchema> = {}
	): Promise<{ orders: Order[]; nextPageToken: string }> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = OpenOrdersInputSchema.parse(resolved);
		const res = await this.#readClient.getOpenOrders(removeUndefined(validatedInput));
		return {
			orders: z.array(OrderSchema).parse(res.orders),
			nextPageToken: res.nextPageToken,
		};
	}

	async listHistory(
		input: z.input<typeof OrderHistoryInputSchema> = {}
	): Promise<{ orders: Order[]; nextPageToken: string }> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = OrderHistoryInputSchema.parse(resolved);
		const res = await this.#readClient.getOrderHistory(removeUndefined(validatedInput));
		return {
			orders: z.array(OrderSchema).parse(res.orders),
			nextPageToken: res.nextPageToken,
		};
	}

	async create(input: z.input<typeof NewOrderInputSchema>): Promise<CreateOrderResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = NewOrderInputSchema.parse(resolved);
		const requestPayload = removeUndefined(validatedInput);
		const res = await this.#writeClient.createOrder(requestPayload);
		return CreateOrderResultSchema.parse(res);
	}

	async cancel(input: z.input<typeof CancelOrderInputSchema>) {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);

		const validated = CancelOrderInputSchema.parse(resolved);

		return await this.#writeClient.cancelOrder({
			key: {
				case: "orderId",
				value: validated.orderId,
			},
			symbolId: validated.symbolId,
			subaccountId: validated.subaccountId,
		});
	}

	async modify(input: z.input<typeof ModifyOrderInputSchema>): Promise<ModifyOrderResult> {
		const resolved = {
			...resolveSubAccountScopedInput(input, this.#resolver),
			requestId:
				input.requestId ??
				globalThis.crypto?.randomUUID?.() ??
				`req_${Date.now()}_${Math.random().toString(16).slice(2)}`,
		};
		const validated = ModifyOrderInputSchema.parse(resolved);
		const res = await this.#writeClient.modifyOrder(removeUndefined(validated));
		return ModifyOrderResultSchema.parse(res);
	}

	async cancelAll(
		input: z.input<typeof CancelAllOrdersInputSchema>
	): Promise<CancelAllOrdersResponse> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = CancelAllOrdersInputSchema.parse(resolved);
		const res = await this.#writeClient.cancelAllOrders(removeUndefined(validated));
		return CancelAllOrdersResponseSchema.parse(res);
	}

	async get(input: z.input<typeof GetOrderInputSchema>): Promise<GetOrderResponse | null> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = GetOrderInputSchema.parse(resolved);
		const res = await this.#readClient.getOrder(removeUndefined(validatedInput));
		return GetOrderResponseSchema.parse(res);
	}

	subscribe(input: SubscribeOrdersInput): () => void {
		const channel = `private:spot:orders:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: ProtoRead.OrderSchema,
			onPublication: (data) => {
				const order = OrderSchema.parse(data);
				input.onEvent(order);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
