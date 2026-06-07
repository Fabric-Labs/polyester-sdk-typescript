import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
	FlowDetailViewSchema,
	FlowSummaryViewSchema,
	GetFlowByIdRequestSchema,
	LifecycleReadService,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import { connectProtoChannel } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { isDev } from "../../utils/is-dev.js";
import {
	GetLifecycleFlowOutputSchema,
	GetLifecycleFlowInputSchema,
	LifecycleFlowDetailSchema,
	LifecycleFlowSummarySchema,
	ListLifecycleFlowsByTxInputSchema,
	ListLifecycleFlowsByTxOutputSchema,
	ListLifecycleFlowsInputSchema,
	ListLifecycleFlowsOutputSchema,
	type GetLifecycleFlowInput,
	type GetLifecycleFlowOutput,
	type LifecycleFlowDetail,
	type LifecycleFlowSummary,
	type ListLifecycleFlowsByTxInput,
	type ListLifecycleFlowsByTxOutput,
	type ListLifecycleFlowsInput,
	type ListLifecycleFlowsOutput,
} from "./lifecycle.schemas.js";

interface SubscribeOpenLifecycleFlowsInput extends BaseSubscribeInput<LifecycleFlowSummary> {
	accountId?: string;
}

interface SubscribeLifecycleFlowDetailInput extends BaseSubscribeInput<LifecycleFlowDetail> {
	flowId: string;
}

export class LifecycleService {
	#client: Client<typeof LifecycleReadService>;

	constructor(transport: Transport) {
		this.#client = createClient(LifecycleReadService, transport);
	}

	async listFlows(
		input: ListLifecycleFlowsInput,
		options: { signal?: AbortSignal } = {}
	): Promise<ListLifecycleFlowsOutput> {
		const parsedInput = ListLifecycleFlowsInputSchema.parse(input);
		const response = await this.#client.listFlows(parsedInput, { signal: options.signal });
		return ListLifecycleFlowsOutputSchema.parse(response);
	}

	async getFlow(input: GetLifecycleFlowInput): Promise<GetLifecycleFlowOutput> {
		const parsedInput = GetLifecycleFlowInputSchema.parse(input);
		const response = await this.#client.getFlowById(
			create(GetFlowByIdRequestSchema, parsedInput)
		);
		return GetLifecycleFlowOutputSchema.parse(response);
	}

	async listFlowsByTx(input: ListLifecycleFlowsByTxInput): Promise<ListLifecycleFlowsByTxOutput> {
		const parsedInput = ListLifecycleFlowsByTxInputSchema.parse(input);
		const response = await this.#client.listFlowsByTx(parsedInput);
		return ListLifecycleFlowsByTxOutputSchema.parse(response);
	}

	subscribeOpenFlows(input: SubscribeOpenLifecycleFlowsInput): () => void {
		const accountId = input.accountId?.trim();
		const channel = accountId
			? `private:chain:lifecycle:flows:${accountId}:proto`
			: "public:chain:lifecycle:flows:proto";
		return connectProtoChannel({
			channel,
			schema: FlowSummaryViewSchema,
			onPublication: (data) => {
				const flow = LifecycleFlowSummarySchema.parse(data);
				input.onEvent(flow);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
			onError: input.onError,
		});
	}

	subscribeFlowDetail(input: SubscribeLifecycleFlowDetailInput): () => void {
		const parsedFlowId = GetLifecycleFlowInputSchema.safeParse({ flowId: input.flowId });
		if (!parsedFlowId.success) {
			if (isDev()) {
				console.error(
					"[LifecycleService] flowId is required for flow detail subscription."
				);
			}
			return () => {};
		}

		const channel = `public:chain:lifecycle:flow:${parsedFlowId.data.flowId}:proto`;
		return connectProtoChannel({
			channel,
			schema: FlowDetailViewSchema,
			onPublication: (data) => {
				const flow = LifecycleFlowDetailSchema.parse(data);
				input.onEvent(flow);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
			onError: input.onError,
		});
	}
}
