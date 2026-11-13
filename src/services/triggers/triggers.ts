import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createClient, type Client } from "@connectrpc/connect";
import * as v from "valibot";
import { parse } from "../../shared/validation.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import { deliverBatch } from "../../shared/subscription-errors.js";
import { createMutationRequestId } from "../../shared/request-id.js";
import {
    createCreateOcoInputSchema,
    createCreateTriggerInputSchema,
    createModifyTriggerInputSchema,
    ListTriggersInputSchema,
    BatchCancelTriggersInputSchema,
    CancelOcoInputSchema,
    CancelTriggerInputSchema,
    PauseTriggerInputSchema,
    ResumeTriggerInputSchema,
    GetTriggerInputSchema,
    ListTriggerEventsInputSchema,
    CreateTriggerResultSchema,
    CreateOcoResultSchema,
    CancelOcoResultSchema,
    BatchCancelTriggersResultSchema,
    CancelTriggerResultSchema,
    ModifyTriggerResultSchema,
    PauseTriggerResultSchema,
    ResumeTriggerResultSchema,
    createTriggerSchema,
    createTriggerEventSchema,
    type Trigger,
    type CreateTriggerInput,
    type CreateOcoInput,
    type CreateOcoResult,
    type CancelOcoInput,
    type CancelOcoResult,
    type BatchCancelTriggersInput,
    type BatchCancelTriggersResult,
    type ListTriggersInput,
    type CancelTriggerInput,
    type GetTriggerInput,
    type ModifyTriggerInput,
    type PauseTriggerInput,
    type ResumeTriggerInput,
    type ListTriggerEventsInput,
    type CreateTriggerResult,
    type CancelTriggerResult,
    type ModifyTriggerResult,
    type PauseTriggerResult,
    type ResumeTriggerResult,
    type ListTriggerEventsResult,
    type TriggerEvent,
} from "./triggers.schemas.js";
import type { BaseSubscribeInput } from "../../shared/types.js";
import type { PolyesterRealtime } from "../../realtime/index.js";

export type {
    CreateTriggerResult,
    CancelTriggerResult,
    ModifyTriggerResult,
    PauseTriggerResult,
    ResumeTriggerResult,
    ListTriggerEventsResult,
};

export interface ListTriggersResult {
    triggers: Trigger[];
    nextPageToken: string;
}

interface SubscribeTriggersInput extends BaseSubscribeInput<Trigger> {
    accountId: string;
}

interface SubscribeTriggerEventsInput extends BaseSubscribeInput<TriggerEvent> {
    accountId: string;
}

/**
 * Manages standalone order triggers and their realtime lifecycle/event streams.
 */
export class TriggersService {
    #client: Client<typeof Proto.TriggersService>;
    #realtime: PolyesterRealtime;
    #resolver?: SubaccountResolver;
    #scales: SdkScales;
    #createTriggerInputSchema: ReturnType<typeof createCreateTriggerInputSchema>;
    #createOcoInputSchema: ReturnType<typeof createCreateOcoInputSchema>;
    #modifyTriggerInputSchema: ReturnType<typeof createModifyTriggerInputSchema>;
    #triggerSchema: ReturnType<typeof createTriggerSchema>;
    #triggerEventSchema: ReturnType<typeof createTriggerEventSchema>;

    constructor(
        transports: AuthApiTransports,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.TriggersService, transports.authApi);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#createTriggerInputSchema = createCreateTriggerInputSchema(scales);
        this.#createOcoInputSchema = createCreateOcoInputSchema(scales);
        this.#modifyTriggerInputSchema = createModifyTriggerInputSchema(scales);
        this.#triggerSchema = createTriggerSchema(scales);
        this.#triggerEventSchema = createTriggerEventSchema(scales);
    }

    /**
     * Creates a standalone trigger for a symbol ID, using that market's catalog quantity scale.
     */
    async create(
        input: CreateTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateTriggerResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validatedInput = parse(this.#createTriggerInputSchema, resolved);
        const res = await this.#client.createTrigger(validatedInput, toConnectCallOptions(options));
        return parse(CreateTriggerResultSchema, res);
    }

    /**
     * Creates an OCO: a take-profit and a stop-loss over a quantity the account already holds, which
     * cancel each other. Returns the OCO's `orderListId` and both legs' trigger IDs; read the legs
     * with `list({ orderListId })`. An `OutcomeUnknownError` means the OCO may exist: list by
     * `clientListId` before retrying.
     */
    async createOco(
        input: CreateOcoInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateOcoResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(this.#createOcoInputSchema, resolved);
        const res = await this.#client.createOco(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return parse(CreateOcoResultSchema, res);
    }

    /**
     * Cancels both legs of an OCO by its `orderListId` and releases its reserved quantity. Canceling
     * either leg with `cancel` does the same.
     */
    async cancelOco(
        input: CancelOcoInput,
        options?: PolyesterMutationOptions,
    ): Promise<CancelOcoResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(CancelOcoInputSchema, resolved);
        const res = await this.#client.cancelOco(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return parse(CancelOcoResultSchema, res);
    }

    /**
     * Fetches one trigger by id in the resolved account scope and returns null when the backend response contains no trigger.
     */
    async get(input: GetTriggerInput, options?: PolyesterRequestOptions): Promise<Trigger | null> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(GetTriggerInputSchema, resolved);
        const res = await this.#client.getTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );

        if (!res.trigger) return null;
        return parse(this.#triggerSchema, res.trigger);
    }

    /**
     * Converts a `triggers.v1.Trigger` message received from another API into the same `Trigger`
     * record that `get`, `list`, and `subscribe` return, scaled with this client's catalog.
     */
    async fromProto(trigger: Proto.Trigger): Promise<Trigger> {
        await this.#scales.ready();
        return parse(this.#triggerSchema, trigger);
    }

    /**
     * Lists triggers for the resolved account scope with optional symbol ID, status, trigger type, parent order, OCO (`orderListId` or `clientListId`), limit, and page-token filters. Results are returned newest-first.
     */
    async list(
        input: ListTriggersInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListTriggersResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(ListTriggersInputSchema, resolved);
        const res = await this.#client.listTriggers(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return {
            triggers: parse(v.array(this.#triggerSchema), res.triggers),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Cancels an active trigger by id in the resolved account scope and returns the trigger id, resulting status, and server timestamp.
     * A trigger that has ended, including one a previous cancel already canceled, throws with code
     * `TRIGGER_STATUS_INVALID` for at least 60 s, and `TRIGGER_NOT_FOUND` after that: treat either as done.
     */
    async cancel(
        input: CancelTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<CancelTriggerResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(CancelTriggerInputSchema, resolved);
        const res = await this.#client.cancelTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return parse(CancelTriggerResultSchema, res);
    }

    /**
     * Cancels 1–50 distinct triggers in one best-effort request; results follow `triggerIds` order.
     * `accepted` means the cancellation was requested. A `rejected` item's `code` says why:
     * `TRIGGER_STATUS_INVALID` has already ended, and `RATE_LIMIT_EXCEEDED`, `PAIR_BACKLOGGED` and
     * `TRIGGER_CONTROL_IN_PROGRESS` can be retried in a new batch. A requestId is generated when
     * omitted; retry a timed-out batch unchanged with the same requestId within 2 minutes.
     */
    async batchCancel(
        input: BatchCancelTriggersInput,
        options?: PolyesterMutationOptions,
    ): Promise<BatchCancelTriggersResult> {
        const resolved = {
            ...resolveAccountScopedInput(input, this.#resolver),
            requestId: input.requestId ?? createMutationRequestId(),
        };
        const validated = parse(BatchCancelTriggersInputSchema, resolved);
        const res = await this.#client.batchCancelTriggers(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        const result = parse(BatchCancelTriggersResultSchema, res);
        if (result.results.length !== validated.triggerIds.length) {
            throw new Error(
                `batchCancel returned ${result.results.length} results for ${validated.triggerIds.length} requested triggers.`,
            );
        }
        return result;
    }

    /**
     * Applies a limited patch to an existing trigger. Omit activationPrice or maxSlippage to leave it unchanged, or pass `{ kind: "none" }` to clear it. Once a trailing stop has started tracking, a new or different activation price rejects the whole patch with `TRIGGER_ACTIVATION_PRICE_NOT_MODIFIABLE`; clearing it or repeating the current price is still accepted. To wait for a new activation price, cancel the trigger and create another. An optional symbol ID must name the trigger's own market; an API key limited to specific markets must pass it.
     */
    async modify(
        input: ModifyTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<ModifyTriggerResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(this.#modifyTriggerInputSchema, resolved);
        const res = await this.#client.modifyTrigger(validated, toConnectCallOptions(options));
        return parse(ModifyTriggerResultSchema, res);
    }

    /**
     * Pauses an active trigger without discarding its immutable strategy configuration.
     */
    async pause(
        input: PauseTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<PauseTriggerResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(PauseTriggerInputSchema, resolved);
        const res = await this.#client.pauseTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return parse(PauseTriggerResultSchema, res);
    }

    /**
     * Resumes a paused trigger. An optional symbol ID must name the trigger's own market; an API key limited to specific markets must pass it.
     */
    async resume(
        input: ResumeTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<ResumeTriggerResult> {
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(ResumeTriggerInputSchema, resolved);
        const res = await this.#client.resumeTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return parse(ResumeTriggerResultSchema, res);
    }

    /**
     * Returns newest-first historical lifecycle events for one trigger, optionally filtered by event type. Fired events enumerate child-order actions. The SDK defaults limit to 50.
     */
    async listEvents(
        input: ListTriggerEventsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListTriggerEventsResult> {
        await this.#scales.ready();
        const resolved = resolveAccountScopedInput(input, this.#resolver);
        const validated = parse(ListTriggerEventsInputSchema, resolved);

        const res = await this.#client.listTriggerEvents(
            removeUndefined({
                triggerId: validated.triggerId,
                subaccountId: validated.subaccountId,
                limit: validated.limit ?? 50,
                eventType: validated.eventType,
                pageToken: validated.pageToken ?? "",
            }),
            toConnectCallOptions(options),
        );

        return {
            events: parse(v.array(this.#triggerEventSchema), res.events),
            nextPageToken: res.nextPageToken,
        };
    }

    /**
     * Subscribes to private trigger state updates on private:spot:triggers:{accountId}:proto and emits parsed trigger records.
     * Keep the copy of each trigger with the highest `version`, across list reads and updates, and ignore any copy whose
     * version is not higher than the one you hold: a reconnect can repeat an earlier state, and list results can lag.
     */
    subscribe(input: SubscribeTriggersInput): () => void {
        const channel = `private:spot:triggers:${input.accountId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.TriggerSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                const trigger = parse(this.#triggerSchema, data);
                input.onEvent(trigger);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }

    /**
     * Subscribes to private trigger lifecycle events on private:spot:triggers:events:{accountId}:proto and emits parsed trigger event records.
     * Each publication batches events, emitted one at a time; `(triggerId, eventType, childSeq,
     * tsNs)` identifies an event, and a repeated identity replaces the earlier copy.
     */
    subscribeEvents(input: SubscribeTriggerEventsInput): () => void {
        const channel = `private:spot:triggers:events:${input.accountId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.TriggerEventBatchSchema,
            ready: () => this.#scales.ready(),
            onPublication: (batch) =>
                deliverBatch(
                    channel,
                    batch.events,
                    (event) => input.onEvent(parse(this.#triggerEventSchema, event)),
                    input.onError,
                ),
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
