import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import {
    createTriggersSchemas,
    ListTriggersInputSchema,
    CancelTriggerInputSchema,
    GetTriggerInputSchema,
    ModifyTriggerInputSchema,
    PauseTriggerInputSchema,
    ListTriggerEventsInputSchema,
    CreateTriggerResultSchema,
    CancelTriggerResultSchema,
    ModifyTriggerResultSchema,
    PauseTriggerResultSchema,
    type Trigger,
    type CreateTriggerInput,
    type ListTriggersInput,
    type CancelTriggerInput,
    type GetTriggerInput,
    type ModifyTriggerInput,
    type PauseTriggerInput,
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
import type { RealtimeClient } from "../../realtime/index.js";
import { staticCatalog, type CatalogReader } from "../../catalogs/index.js";

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
    total: number;
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
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;
    #schemas: ReturnType<typeof createTriggersSchemas>;

    constructor(
        transport: Transport,
        realtime: RealtimeClient,
        resolver?: SubaccountResolver,
        catalog: CatalogReader = staticCatalog,
    ) {
        this.#client = createClient(Proto.TriggersService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
        this.#schemas = createTriggersSchemas(catalog);
    }

    /**
     * Creates a standalone trigger, such as stop-loss, take-profit, trailing-stop, TWAP, or ladder, for the resolved account scope. The request includes trigger conditions, order fields, strategy-specific fields, and optional clientTriggerId.
     */
    async create(
        input: CreateTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const schemas = this.#schemas.current();
        const validatedInput = v.parse(schemas.createTriggerInput, resolved);
        const res = await this.#client.createTrigger(validatedInput, toConnectCallOptions(options));
        return v.parse(CreateTriggerResultSchema, res);
    }

    /**
     * Fetches one trigger by id in the resolved account scope and returns null when the backend response contains no trigger.
     */
    async get(input: GetTriggerInput, options?: PolyesterRequestOptions): Promise<Trigger | null> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(GetTriggerInputSchema, resolved);
        const res = await this.#client.getTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );

        if (!res.trigger) return null;
        const schemas = this.#schemas.current();
        return v.parse(schemas.trigger, res.trigger);
    }

    /**
     * Lists triggers for the resolved account scope with optional symbol, status, trigger type, parent order, limit, and offset filters. Results are returned newest-first with a total count.
     */
    async list(
        input: ListTriggersInput = {},
        options?: PolyesterRequestOptions,
    ): Promise<ListTriggersResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ListTriggersInputSchema, resolved);
        const res = await this.#client.listTriggers(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        const schemas = this.#schemas.current();
        return {
            triggers: v.parse(v.array(schemas.trigger), res.triggers),
            total: res.total,
        };
    }

    /**
     * Cancels an active trigger by id in the resolved account scope and returns the trigger id, resulting status, and server timestamp.
     */
    async cancel(
        input: CancelTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<CancelTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(CancelTriggerInputSchema, resolved);
        const res = await this.#client.cancelTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(CancelTriggerResultSchema, res);
    }

    /**
     * Applies a limited patch to an existing trigger, covering trigger price, limit price, trailing distance, activation price, and market slippage fields where supported.
     */
    async modify(
        input: ModifyTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<ModifyTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ModifyTriggerInputSchema, resolved);
        const res = await this.#client.modifyTrigger(validated, toConnectCallOptions(options));
        return v.parse(ModifyTriggerResultSchema, res);
    }

    /**
     * Pauses an active trigger by id in the resolved account scope and returns the resulting trigger status.
     */
    async pause(
        input: PauseTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<PauseTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(PauseTriggerInputSchema, resolved);
        const res = await this.#client.pauseTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(PauseTriggerResultSchema, res);
    }

    /**
     * Resumes a paused trigger by id in the resolved account scope and returns the resulting trigger status.
     */
    async resume(
        input: PauseTriggerInput,
        options?: PolyesterMutationOptions,
    ): Promise<ResumeTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(PauseTriggerInputSchema, resolved);
        const res = await this.#client.resumeTrigger(
            removeUndefined(validated),
            toConnectCallOptions(options),
        );
        return v.parse(PauseTriggerResultSchema, res);
    }

    /**
     * Returns newest-first historical lifecycle events for one trigger, including fire, cancel, update, child order, fire price, and reason details. The SDK defaults limit to 50 and converts nextBeforeTsNs from nanoseconds to milliseconds.
     */
    async listEvents(
        input: ListTriggerEventsInput,
        options?: PolyesterRequestOptions,
    ): Promise<ListTriggerEventsResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ListTriggerEventsInputSchema, resolved);

        const res = await this.#client.listTriggerEvents(
            removeUndefined({
                triggerId: validated.triggerId,
                subaccountId: validated.subaccountId,
                limit: validated.limit ?? 50,
                beforeTsNs: validated.beforeTsNs ?? 0n,
            }),
            toConnectCallOptions(options),
        );

        const schemas = this.#schemas.current();
        return {
            events: v.parse(v.array(schemas.triggerEvent), res.events),
            nextBeforeTsNs: Number(res.nextBeforeTsNs) / 1_000_000,
        };
    }

    /**
     * Subscribes to private trigger state updates on private:spot:triggers:{accountId}:proto and emits parsed trigger records.
     */
    subscribe(input: SubscribeTriggersInput): () => void {
        const channel = `private:spot:triggers:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TriggerSchema,
            onPublication: (data) => {
                const schemas = this.#schemas.current();
                const trigger = v.parse(schemas.trigger, data);
                input.onEvent(trigger);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }

    /**
     * Subscribes to private trigger lifecycle events on private:spot:triggers:events:{accountId}:proto and emits parsed trigger event records.
     */
    subscribeEvents(input: SubscribeTriggerEventsInput): () => void {
        const channel = `private:spot:triggers:events:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TriggerEventSchema,
            onPublication: (data) => {
                const schemas = this.#schemas.current();
                const event = v.parse(schemas.triggerEvent, data);
                input.onEvent(event);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
