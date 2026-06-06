import * as Proto from "../../gen/orders/v1/orders_read_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import { connectProtoChannel } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types";
import { UserTradeSchema, GetUserTradesInputSchema, type Trade } from "./trades.schemas";
import { createLocalMockNoopSubscription } from "../../mock/local-mock-subscription";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime";
import { EMPTY_USER_TRADES_RESULT } from "../../mock/polyester-mock-world";

interface SubscribeTradesInput extends BaseSubscribeInput<Trade> {
	accountId: string;
}

export class TradesService {
	#client: Client<typeof Proto.OrdersReadService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.OrdersReadService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async list(
		input: z.input<typeof GetUserTradesInputSchema> = {}
	): Promise<{ trades: Trade[]; nextPageToken: string }> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		if (this.#localMock?.isEnabled()) return { ...EMPTY_USER_TRADES_RESULT };
		const validatedInput = GetUserTradesInputSchema.parse(resolved);
		const res = await this.#client.getUserTrades(removeUndefined(validatedInput));
		return {
			trades: z.array(UserTradeSchema).parse(res.trades),
			nextPageToken: res.nextPageToken,
		};
	}

	subscribe(input: SubscribeTradesInput) {
		if (this.#localMock?.isEnabled()) {
			return createLocalMockNoopSubscription(input);
		}
		const channel = `private:spot:trades:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.UserTradeSchema,
			onPublication: (data) => {
				const trade = UserTradeSchema.parse(data);
				input.onEvent(trade);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
