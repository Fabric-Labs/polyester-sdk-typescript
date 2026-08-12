import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
    FlowDetailViewSchema,
    FlowSummaryViewSchema,
    GetFlowByIdRequestSchema,
    LifecycleReadService,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { isDev } from "../../utils/is-dev.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import {
    GetLifecycleFlowInputSchema,
    GetLifecycleFlowOutputSchema,
    LifecycleFlowDetailSchema,
    LifecycleFlowSummarySchema,
    ListLifecycleFlowsByTxOutputSchema,
    ListLifecycleFlowsByTxInputSchema,
    ListLifecycleFlowsOutputSchema,
    ListLifecycleFlowsInputSchema,
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

/**
 * Reads and streams chain lifecycle flow state, history, progress, and transaction matches.
 */
export class LifecycleService {
    #client: Client<typeof LifecycleReadService>;
    #realtime: PolyesterRealtime;

    constructor(transport: Transport, realtime: PolyesterRealtime) {
        this.#client = createClient(LifecycleReadService, transport);
        this.#realtime = realtime;
    }

    /**
     * Returns paginated lifecycle flow summaries filtered by kind, state, scope, account selector, transaction reference, chain ids, and asset ids. The response is ordered by the selected timestamp and includes an opaque next page token.
     */
    async listFlows(
        input: ListLifecycleFlowsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListLifecycleFlowsOutput> {
        const parsedInput = parse(ListLifecycleFlowsInputSchema, input);
        const response = await this.#client.listFlows(parsedInput, toConnectCallOptions(options));
        const res = parse(ListLifecycleFlowsOutputSchema, response);
        return res;
    }

    /**
     * Fetches one lifecycle flow by its public flow id and returns summary, factual steps, timeline, and live-state detail when available.
     */
    async getFlow(
        input: GetLifecycleFlowInput,
        options?: PolyesterRequestOptions,
    ): Promise<GetLifecycleFlowOutput> {
        const parsedInput = parse(GetLifecycleFlowInputSchema, input);
        const response = await this.#client.getFlowById(
            create(GetFlowByIdRequestSchema, parsedInput),
            toConnectCallOptions(options),
        );
        return parse(GetLifecycleFlowOutputSchema, response);
    }

    /**
     * Searches lifecycle flows that reference a 0x-prefixed transaction hash, using source-only or any-reference lookup mode. A single transaction may match zero, one, or many flows.
     */
    async listFlowsByTx(
        input: ListLifecycleFlowsByTxInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListLifecycleFlowsByTxOutput> {
        const parsedInput = parse(ListLifecycleFlowsByTxInputSchema, input);
        const response = await this.#client.listFlowsByTx(
            parsedInput,
            toConnectCallOptions(options),
        );
        return parse(ListLifecycleFlowsByTxOutputSchema, response);
    }

    /**
     * Subscribes to open lifecycle flow summary updates, using private:chain:lifecycle:flows:{accountId}:proto when an account id is provided and the public flow channel otherwise.
     */
    subscribeOpenFlows(input: SubscribeOpenLifecycleFlowsInput): () => void {
        const accountId = input.accountId?.trim();
        const channel = accountId
            ? `private:chain:lifecycle:flows:${accountId}:proto`
            : "public:chain:lifecycle:flows:proto";
        return this.#realtime.connectProtoChannel({
            channel,
            schema: FlowSummaryViewSchema,
            onPublication: (data) => {
                const flow = parse(LifecycleFlowSummarySchema, data);
                input.onEvent(flow);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }

    /**
     * Subscribes to detail updates for one lifecycle flow on public:chain:lifecycle:flow:{flowId}:proto. Invalid flow ids are rejected locally with a no-op unsubscribe function.
     */
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
                const flow = parse(LifecycleFlowDetailSchema, data);
                input.onEvent(flow);
            },
            onConnected: input.onOpen,
            onDisconnected: input.onClose,
            onError: input.onError,
        });
    }
}
