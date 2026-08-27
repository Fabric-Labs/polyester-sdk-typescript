import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
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
import { connectReadyGatedProtoChannel } from "../../realtime/ready-gated-subscription.js";
import {
    createCreateTriggerInputSchema,
    createModifyTriggerInputSchema,
    ListTriggersInputSchema,
    CancelTriggerInputSchema,
    PauseTriggerInputSchema,
    ResumeTriggerInputSchema,
    GetTriggerInputSchema,
    ListTriggerEventsInputSchema,
    CreateTriggerResultSchema,
    CancelTriggerResultSchema,
    ModifyTriggerResultSchema,
    PauseTriggerResultSchema,
    ResumeTriggerResultSchema,
    createTriggerSchema,
    createTriggerEventSchema,
    type Trigger,
    type CreateTriggerInput,
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
    #modifyTriggerInputSchema: ReturnType<typeof createModifyTriggerInputSchema>;
    #triggerSchema: ReturnType<typeof createTriggerSchema>;
    #triggerEventSchema: ReturnType<typeof createTriggerEventSchema>;

    constructor(
        transport: Transport,
        realtime: PolyesterRealtime,
        resolver: SubaccountResolver | undefined,
        scales: SdkScales,
    ) {
        this.#client = createClient(Proto.TriggersService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#scales = scales;
        this.#createTriggerInputSchema = createCreateTriggerInputSchema(scales);
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
     * Lists triggers for the resolved account scope with optional symbol ID, status, trigger type, parent order, limit, and page-token filters. Results are returned newest-first.
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
     * Applies a limited patch to an existing trigger. The symbol ID routes policy checks for exposure-increasing changes.
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
     * Resumes a paused trigger using its symbol ID for policy checks.
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
     */
    subscribeEvents(input: SubscribeTriggerEventsInput): () => void {
        const channel = `private:spot:triggers:events:${input.accountId}:proto`;
        return connectReadyGatedProtoChannel(this.#realtime, {
            channel,
            schema: Proto.TriggerEventSchema,
            ready: () => this.#scales.ready(),
            onPublication: (data) => {
                const event = parse(this.#triggerEventSchema, data);
                input.onEvent(event);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: input.onError,
        });
    }
}
