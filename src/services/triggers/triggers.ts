import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as v from "valibot";
import { type SubaccountResolver, resolveSubaccountScopedInput } from "../subaccount-resolver.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { parseOptionalUint64Decimal } from "../../utils/numbers.js";
import {
    CreateTriggerInputSchema,
    ListTriggersInputSchema,
    CancelTriggerInputSchema,
    GetTriggerInputSchema,
    ModifyTriggerInputSchema,
    PauseTriggerInputSchema,
    ListTriggerEventsInputSchema,
    TriggerSchema,
    TriggerEventSchema,
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

export class TriggersService {
    #client: Client<typeof Proto.TriggersService>;
    #realtime: RealtimeClient;
    #resolver?: SubaccountResolver;

    constructor(transport: Transport, realtime: RealtimeClient, resolver?: SubaccountResolver) {
        this.#client = createClient(Proto.TriggersService, transport);
        this.#realtime = realtime;
        this.#resolver = resolver;
    }

    /**
     * Create a standalone trigger (stop loss, take profit, trailing stop, TWAP, or ladder).
     */
    async create(input: CreateTriggerInput): Promise<CreateTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validatedInput = v.parse(CreateTriggerInputSchema, resolved);
        const res = await this.#client.createTrigger(validatedInput);
        return v.parse(CreateTriggerResultSchema, res);
    }

    /**
     * Get a trigger by ID.
     */
    async get(input: GetTriggerInput): Promise<Trigger | null> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(GetTriggerInputSchema, resolved);
        const res = await this.#client.getTrigger(removeUndefined(validated));

        if (!res.trigger) return null;
        return v.parse(TriggerSchema, res.trigger);
    }

    /**
     * List triggers for a subaccount with optional filters.
     */
    async list(input: ListTriggersInput = {}): Promise<ListTriggersResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ListTriggersInputSchema, resolved);
        const res = await this.#client.listTriggers(removeUndefined(validated));
        return {
            triggers: v.parse(v.array(TriggerSchema), res.triggers),
            total: res.total,
        };
    }

    /**
     * Cancel a trigger.
     */
    async cancel(input: CancelTriggerInput): Promise<CancelTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(CancelTriggerInputSchema, resolved);
        const res = await this.#client.cancelTrigger(removeUndefined(validated));
        return v.parse(CancelTriggerResultSchema, res);
    }

    /**
     * Modify a trigger (limited patch for trigger price, limit price, trailing params).
     */
    async modify(input: ModifyTriggerInput): Promise<ModifyTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ModifyTriggerInputSchema, resolved);
        const res = await this.#client.modifyTrigger(validated);
        return v.parse(ModifyTriggerResultSchema, res);
    }

    /**
     * Pause a trigger.
     */
    async pause(input: PauseTriggerInput): Promise<PauseTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(PauseTriggerInputSchema, resolved);
        const res = await this.#client.pauseTrigger(removeUndefined(validated));
        return v.parse(PauseTriggerResultSchema, res);
    }

    /**
     * Resume a paused trigger.
     */
    async resume(input: PauseTriggerInput): Promise<ResumeTriggerResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(PauseTriggerInputSchema, resolved);
        const res = await this.#client.resumeTrigger(removeUndefined(validated));
        return v.parse(PauseTriggerResultSchema, res);
    }

    /**
     * List trigger events (audit trail of fires, cancels, updates).
     */
    async listEvents(input: ListTriggerEventsInput): Promise<ListTriggerEventsResult> {
        const resolved = resolveSubaccountScopedInput(input, this.#resolver);
        const validated = v.parse(ListTriggerEventsInputSchema, resolved);

        const res = await this.#client.listTriggerEvents(
            removeUndefined({
                triggerId: validated.triggerId,
                subaccountId: validated.subaccountId,
                limit: validated.limit ?? 50,
                beforeTsNs: input.beforeTsNs
                    ? (parseOptionalUint64Decimal(input.beforeTsNs) ?? 0n)
                    : 0n,
            }),
        );

        return {
            events: v.parse(v.array(TriggerEventSchema), res.events),
            nextBeforeTsNs: Number(res.nextBeforeTsNs) / 1_000_000,
        };
    }

    /**
     * Subscribe to triggers for a specific account or subaccount.
     */
    subscribe(input: SubscribeTriggersInput): () => void {
        const channel = `private:spot:triggers:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TriggerSchema,
            onPublication: (data) => {
                const trigger = v.parse(TriggerSchema, data);
                input.onEvent(trigger);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }

    /**
     * Subscribe to trigger events for a specific account or subaccount.
     */
    subscribeEvents(input: SubscribeTriggerEventsInput): () => void {
        const channel = `private:spot:triggers:events:${input.accountId}:proto`;
        return this.#realtime.connectProtoChannel({
            channel,
            schema: Proto.TriggerEventSchema,
            onPublication: (data) => {
                const event = v.parse(TriggerEventSchema, data);
                input.onEvent(event);
            },
            onConnected: () => input.onOpen?.(),
            onDisconnected: () => input.onClose?.(),
            onError: (ctx) => input.onError?.(ctx),
        });
    }
}
