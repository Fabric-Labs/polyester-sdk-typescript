import * as Proto from "../../gen/triggers/v1/triggers_pb.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
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
import { connectProtoChannel } from "../../realtime/index.js";

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
	#resolver?: SubAccountResolver;

	constructor(transport: Transport, resolver?: SubAccountResolver) {
		this.#client = createClient(Proto.TriggersService, transport);
		this.#resolver = resolver;
	}

	/**
	 * Create a standalone trigger (stop loss, take profit, trailing stop, TWAP, or ladder).
	 */
	async create(input: CreateTriggerInput): Promise<CreateTriggerResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validatedInput = CreateTriggerInputSchema.parse(resolved);
		const res = await this.#client.createTrigger(validatedInput);
		return CreateTriggerResultSchema.parse(res);
	}

	/**
	 * Get a trigger by ID.
	 */
	async get(input: GetTriggerInput): Promise<Trigger | null> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = GetTriggerInputSchema.parse(resolved);
		const res = await this.#client.getTrigger(removeUndefined(validated));

		if (!res.trigger) return null;
		return TriggerSchema.parse(res.trigger);
	}

	/**
	 * List triggers for a sub-account with optional filters.
	 */
	async list(input: ListTriggersInput = {}): Promise<ListTriggersResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = ListTriggersInputSchema.parse(resolved);
		const res = await this.#client.listTriggers(removeUndefined(validated));
		return {
			triggers: z.array(TriggerSchema).parse(res.triggers),
			total: res.total,
		};
	}

	/**
	 * Cancel a trigger.
	 */
	async cancel(input: CancelTriggerInput): Promise<CancelTriggerResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = CancelTriggerInputSchema.parse(resolved);
		const res = await this.#client.cancelTrigger(removeUndefined(validated));
		return CancelTriggerResultSchema.parse(res);
	}

	/**
	 * Modify a trigger (limited patch for trigger price, limit price, trailing params).
	 */
	async modify(input: ModifyTriggerInput): Promise<ModifyTriggerResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = ModifyTriggerInputSchema.parse(resolved);
		const res = await this.#client.modifyTrigger(validated);
		return ModifyTriggerResultSchema.parse(res);
	}

	/**
	 * Pause a trigger.
	 */
	async pause(input: PauseTriggerInput): Promise<PauseTriggerResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = PauseTriggerInputSchema.parse(resolved);
		const res = await this.#client.pauseTrigger(removeUndefined(validated));
		return PauseTriggerResultSchema.parse(res);
	}

	/**
	 * Resume a paused trigger.
	 */
	async resume(input: PauseTriggerInput): Promise<ResumeTriggerResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = PauseTriggerInputSchema.parse(resolved);
		const res = await this.#client.resumeTrigger(removeUndefined(validated));
		return PauseTriggerResultSchema.parse(res);
	}

	/**
	 * List trigger events (audit trail of fires, cancels, updates).
	 */
	async listEvents(input: ListTriggerEventsInput): Promise<ListTriggerEventsResult> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		const validated = ListTriggerEventsInputSchema.parse(resolved);

		const res = await this.#client.listTriggerEvents(
			removeUndefined({
				triggerId: validated.triggerId,
				subaccountId: validated.subaccountId,
				limit: validated.limit ?? 50,
				beforeTsNs: input.beforeTsNs
					? (parseOptionalUint64Decimal(input.beforeTsNs) ?? 0n)
					: 0n,
			})
		);

		return {
			events: z.array(TriggerEventSchema).parse(res.events),
			nextBeforeTsNs: Number(res.nextBeforeTsNs) / 1_000_000,
		};
	}

	subscribe(input: SubscribeTriggersInput): () => void {
		const channel = `private:spot:triggers:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.TriggerSchema,
			onPublication: (data) => {
				const trigger = TriggerSchema.parse(data);
				input.onEvent(trigger);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}

	subscribeEvents(input: SubscribeTriggerEventsInput): () => void {
		const channel = `private:spot:triggers:events:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.TriggerEventSchema,
			onPublication: (data) => {
				const event = TriggerEventSchema.parse(data);
				input.onEvent(event);
			},
			onConnected: () => input.onOpen?.(),
			onDisconnected: () => input.onClose?.(),
		});
	}
}
