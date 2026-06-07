import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
    FlowDetailViewSchema,
    FlowSummaryViewSchema,
    GetFlowByIdRequestSchema,
    LifecycleReadService,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import type { RealtimeClient } from "../../realtime/client.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import { isDev } from "../../utils/is-dev.js";
import * as v from "valibot";
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
    #realtime: RealtimeClient;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.#client = createClient(LifecycleReadService, transport);
        this.#realtime = realtime;
    }

    async listFlows(
        input: ListLifecycleFlowsInput,
        options: { signal?: AbortSignal } = {},
    ): Promise<ListLifecycleFlowsOutput> {
        const parsedInput = v.parse(ListLifecycleFlowsInputSchema, input);
        const response = await this.#client.listFlows(parsedInput, { signal: options.signal });
        return v.parse(ListLifecycleFlowsOutputSchema, response);
    }

    async getFlow(input: GetLifecycleFlowInput): Promise<GetLifecycleFlowOutput> {
        const parsedInput = v.parse(GetLifecycleFlowInputSchema, input);
        const response = await this.#client.getFlowById(
            create(GetFlowByIdRequestSchema, parsedInput),
        );
        return v.parse(GetLifecycleFlowOutputSchema, response);
    }

    async listFlowsByTx(input: ListLifecycleFlowsByTxInput): Promise<ListLifecycleFlowsByTxOutput> {
        const parsedInput = v.parse(ListLifecycleFlowsByTxInputSchema, input);
        const response = await this.#client.listFlowsByTx(parsedInput);
        return v.parse(ListLifecycleFlowsByTxOutputSchema, response);
    }

    subscribeOpenFlows(input: SubscribeOpenLifecycleFlowsInput): () => void {
        const accountId = input.accountId?.trim();
        const channel = accountId
            ? `private:chain:lifecycle:flows:${accountId}:proto`
            : "public:chain:lifecycle:flows:proto";
        return this.#realtime.connectProtoChannel({
            channel,
            schema: FlowSummaryViewSchema,
            onPublication: (data) => {
                const flow = v.parse(LifecycleFlowSummarySchema, data);
                input.onEvent(flow);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }

    subscribeFlowDetail(input: SubscribeLifecycleFlowDetailInput): () => void {
        const parsedFlowId = v.safeParse(GetLifecycleFlowInputSchema, { flowId: input.flowId });
        if (!parsedFlowId.success) {
            if (isDev()) {
                console.error(
                    "[LifecycleService] flowId is required for flow detail subscription.",
                );
            }
            return () => {};
        }

        const channel = `public:chain:lifecycle:flow:${parsedFlowId.output.flowId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: FlowDetailViewSchema,
            onPublication: (data) => {
                const flow = v.parse(LifecycleFlowDetailSchema, data);
                input.onEvent(flow);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
