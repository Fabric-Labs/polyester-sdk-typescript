import * as v from "valibot";
import { fromU128, u128ToDecimal } from "../../utils/u128.js";
import {
    accountCodeNameFor,
    formatAmountDisplay,
    LEDGER_SCALE,
    symbolForAssetId,
    transferTypeNameFor,
} from "../../catalogs/ledger-catalog.js";
import { normalizeToMillis } from "../../utils/time.js";
import { optionalSubAccountIdInputSchema } from "../../shared/schemas.js";

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

export const LedgerTransferSchema = v.pipe(
    v.object({
        txId: v.string(),
        assetId: v.number(),
        amount: v.optional(U128Schema),
        balanceAfter: v.optional(U128Schema),
        isDebit: v.boolean(),
        type: v.number(),
        accountCode: v.number(),
        pending: v.optional(v.boolean()),
        timestamp: v.optional(v.bigint()),
        onchain: v.optional(v.boolean()),
        linkId: v.optional(v.bigint()),
        flowId: v.optional(v.string()),
    }),
    v.transform((tr) => {
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
    }),
);

export type LedgerTransfer = v.InferOutput<typeof LedgerTransferSchema>;

export const ListTransfersInputSchema = v.pipe(
    v.object({
        subAccountId: optionalSubAccountIdInputSchema(),
        ledger: v.optional(v.optional(v.number()), 0),
        limit: v.optional(v.number()),
        reversed: v.optional(v.optional(v.boolean()), false),
        since: v.pipe(
            v.optional(v.optional(v.number()), 0),
            v.transform((v) => BigInt(v ?? 0)),
        ),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type ListTransfersInput = v.InferInput<typeof ListTransfersInputSchema>;
