import { z } from "zod";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import {
	accountCodeNameFor,
	formatAmountDisplay,
	LEDGER_SCALE,
	symbolForAssetId,
	transferTypeNameFor,
} from "../../catalogs/ledger-catalog.js";
import { normalizeToMillis } from "../../utils/time.js";
import { idToBigInt } from "../../utils/base58-id.js";

const U128Schema = z.object({
	hi: z.bigint(),
	lo: z.bigint(),
});

export const LedgerTransferSchema = z
	.object({
		txId: z.string(),
		assetId: z.number(),
		amount: U128Schema.optional(),
		balanceAfter: U128Schema.optional(),
		isDebit: z.boolean(),
		type: z.number(),
		accountCode: z.number(),
		pending: z.boolean().optional(),
		timestamp: z.bigint().optional(),
		onchain: z.boolean().optional(),
		linkId: z.bigint().optional(),
		flowId: z.string().optional(),
	})
	.transform((tr) => {
		const aid = tr.assetId;
		const amt128 = fromU128(tr.amount);
		const bal128 = fromU128(tr.balanceAfter);
		const isDebit = tr.isDebit;

		let amount =
			aid !== 0
				? formatAmountDisplay(u128ToDecimal(amt128, LEDGER_SCALE), aid)
				: u128ToDecimal(amt128, LEDGER_SCALE);
		if (isDebit) amount = `-${amount}`;
		else amount = `+${amount}`;

		const balanceAfter =
			bal128 !== 0n
				? aid !== 0
					? formatAmountDisplay(u128ToDecimal(bal128, LEDGER_SCALE), aid)
					: u128ToDecimal(bal128, LEDGER_SCALE)
				: undefined;

		const linkIdNum = Number(tr.linkId ?? 0n);

		return {
			txId: tr.txId,
			amount,
			symbol: symbolForAssetId(aid),
			type: transferTypeNameFor(tr.type),
			accountCode: accountCodeNameFor(tr.accountCode),
			pending: tr.pending,
			onchain: tr.onchain,
			timestamp: normalizeToMillis(Number(tr.timestamp)),
			balanceAfter,
			isDebit,
			linkId: linkIdNum || undefined,
			flowId: tr.flowId?.trim() ?? "",
		};
	});

export type LedgerTransfer = z.output<typeof LedgerTransferSchema>;

export const ListTransfersInputSchema = z
	.object({
		subAccountId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? idToBigInt(v, "subaccountId") : undefined)),
		ledger: z.number().optional().default(0),
		limit: z.number().optional(),
		reversed: z.boolean().optional().default(false),
		since: z
			.number()
			.optional()
			.default(0)
			.transform((v) => BigInt(v)),
	})
	.transform(({ subAccountId, ...rest }) => ({
		...rest,
		subaccountId: subAccountId,
	}));

export type ListTransfersInput = z.input<typeof ListTransfersInputSchema>;
