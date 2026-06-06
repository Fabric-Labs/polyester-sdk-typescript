import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { z } from "zod";
import { connectProtoChannel } from "../../realtime";
import {
	type SubAccountResolver,
	resolveSubAccountId,
	resolveSubAccountScopedInput,
} from "../sub-account-resolver";
import { idToBigInt } from "../../utils/base58-id";
import type { BaseSubscribeInput } from "../../shared/types";
import {
	LedgerBalanceSchema,
	BalanceHistoryInputSchema,
	BalanceHistoryResponseSchema,
	EquityHistoryInputSchema,
	EquityHistoryResponseSchema,
	type LedgerBalance,
	type BalanceHistoryInput,
	type BalanceHistoryResponse,
	type EquityHistoryInput,
	type EquityHistoryResponse,
} from "./balances.schemas";
import { isKnownAssetId } from "../../catalogs/ledger-catalog";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime";

interface SubscribeBalancesInput extends BaseSubscribeInput<LedgerBalance> {
	accountId: string;
}

function isZeroBalance(balance: LedgerBalance): boolean {
	return (
		balance.unified <= 0 &&
		balance.funding <= 0 &&
		balance.reserved <= 0 &&
		balance.available <= 0
	);
}

export class BalancesService {
	#client: Client<typeof Proto.LedgerReadService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.LedgerReadService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async list(input: { subAccountId?: string } = {}): Promise<LedgerBalance[]> {
		const resolved = resolveSubAccountId(input.subAccountId, this.#resolver);
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.listBalances(this.#accountIdForMock(resolved));
		}
		const res = await this.#client.getBalances({
			subaccountId: resolved ? idToBigInt(resolved, "subaccountId") : undefined,
		});
		return z
			.array(LedgerBalanceSchema)
			.parse(res.balances.filter((b) => isKnownAssetId(b.assetId)))
			.filter((b) => !isZeroBalance(b));
	}

	async getBalanceHistory(input: BalanceHistoryInput): Promise<BalanceHistoryResponse> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.getBalanceHistory(
				this.#accountIdForMock(resolved.subAccountId),
				resolved
			);
		}
		const validated = BalanceHistoryInputSchema.parse(resolved);
		const res = await this.#client.getBalanceHistory(validated);
		return BalanceHistoryResponseSchema.parse(res);
	}

	async getEquityHistory(
		input: EquityHistoryInput,
		options: { signal?: AbortSignal } = {}
	): Promise<EquityHistoryResponse> {
		const resolved = resolveSubAccountScopedInput(input, this.#resolver);
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.getEquityHistory(
				this.#accountIdForMock(resolved.subAccountId),
				resolved
			);
		}
		const validated = EquityHistoryInputSchema.parse(resolved);
		const res = await this.#client.getEquityHistorySeries(validated, {
			signal: options.signal,
		});
		return EquityHistoryResponseSchema.parse(res);
	}

	subscribe(input: SubscribeBalancesInput): () => void {
		if (this.#localMock?.isEnabled()) {
			return this.#localMock.world.subscribeBalances(input);
		}
		const channel = `private:ledger:balances:${input.accountId}:proto`;
		return connectProtoChannel({
			channel,
			schema: Proto.AssetBalanceSchema,
			onPublication: (data) => {
				if (!isKnownAssetId(data.assetId)) return;
				const b = LedgerBalanceSchema.parse(data);
				input.onEvent(b);
			},
			onConnected: input.onOpen,
			onDisconnected: input.onClose,
		});
	}

	#accountIdForMock(resolvedSubAccountId: string | undefined): string {
		return (
			resolvedSubAccountId ??
			this.#resolver?.getMainAccountId?.() ??
			this.#resolver?.getActiveAccountId?.() ??
			"main"
		);
	}
}
