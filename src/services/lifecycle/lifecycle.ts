import { createClient, type Client } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
    FlowDetailViewSchema,
    FlowSummaryViewSchema,
    GetFlowByIdRequestSchema,
    LifecycleReadService,
} from "../../gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import type { PolyesterRealtime } from "../../realtime/types.js";
import type { AuthAndPublicApiTransports } from "../../shared/transports.js";
import { resolveAccountScopedInput, type SubaccountResolver } from "../subaccount-resolver.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import {
    toConnectCallOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { isDev } from "../../utils/is-dev.js";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import {
    GetLifecycleAccountFlowInputSchema,
    GetLifecycleFlowInputSchema,
    GetLifecycleFlowOutputSchema,
    LifecycleFlowDetailSchema,
    LifecycleFlowSummarySchema,
    ListLifecycleFlowsByTxOutputSchema,
    ListLifecycleFlowsByTxInputSchema,
    ListLifecycleFlowsOutputSchema,
    ListLifecycleFlowsInputSchema,
    ListLifecycleAccountFlowsInputSchema,
    type GetLifecycleAccountFlowInput,
    type GetLifecycleFlowInput,
    type GetLifecycleFlowOutput,
    type LifecycleFlowDetail,
    type LifecycleFlowSummary,
    type ListLifecycleFlowsByTxInput,
    type ListLifecycleFlowsByTxOutput,
    type ListLifecycleFlowsInput,
    type ListLifecycleAccountFlowsInput,
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
    #authClient: Client<typeof LifecycleReadService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;

    constructor(
        transports: AuthAndPublicApiTransports,
        realtime: PolyesterRealtime,
        resolver?: SubaccountResolver,
    ) {
        this.#client = createClient(LifecycleReadService, transports.publicApi);
        this.#authClient = createClient(LifecycleReadService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Returns paginated lifecycle flow summaries filtered by kind, state, scope, account selector, transaction reference, chain ids, and asset ids. The response is ordered by the selected timestamp and includes an opaque next page token.
     *
     * Lists only flows a chain transaction started. With an `accountSelector` (a smart
     * account address), the list holds the flows the account owns and the transfers it
     * receives from other accounts; each row's `participation` says which. Pass
     * `participation: "owner"` for the owned flows only. A `pageToken` only resumes the
     * request it came from: change nothing but `limit` between pages. Use `listAccountFlows`
     * for every flow of the signed-in account.
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
     * Lists the signed-in account's flows: the ones it owns and the transfers it receives,
     * including flows no chain transaction started, such as transfers between Trading accounts.
     * Each row's `participation` says which. Takes the same filters as `listFlows`; a
     * `pageToken` only resumes the request it came from. API keys need `read-funding-flows`.
     */
    async listAccountFlows(
        input: ListLifecycleAccountFlowsInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListLifecycleFlowsOutput> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = parse(ListLifecycleAccountFlowsInputSchema, resolved);
        const response = await this.#authClient.listAccountFlows(
            request,
            toConnectCallOptions(options),
        );
        return parse(ListLifecycleFlowsOutputSchema, response);
    }

    /**
     * Fetches one flow the signed-in account owns or receives, including one no chain
     * transaction started. A flow the account takes no part in throws `ResourceNotFoundError`. API keys
     * need `read-funding-flows`.
     */
    async getAccountFlow(
        input: GetLifecycleAccountFlowInput,
        options?: PolyesterRequestOptions,
    ): Promise<GetLifecycleFlowOutput> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const request = parse(GetLifecycleAccountFlowInputSchema, resolved);
        const response = await this.#authClient.getAccountFlow(
            request,
            toConnectCallOptions(options),
        );
        return parse(GetLifecycleFlowOutputSchema, response);
    }

    /**
     * Fetches one lifecycle flow by its public flow id and returns summary, factual steps,
     * timeline, and live-state detail when available. Finds only flows a chain transaction
     * started; the account reads its other flows with `getAccountFlow`.
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
