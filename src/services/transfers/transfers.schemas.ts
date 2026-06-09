import * as v from "valibot";
import { fromU128 } from "../../utils/u128.js";
import { accountCodeNameFor, transferTypeNameFor } from "../../shared/ledger-codes.js";
import { tsNsToMs } from "../../utils/time.js";
import { OptionalTimestampMsToNsInputSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

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
        timestamp: v.bigint(),
        onchain: v.optional(v.boolean()),
        linkId: v.optional(v.bigint()),
        flowId: v.optional(v.string()),
    }),
    v.transform((tr) => {
        const amountQ = fromU128(tr.amount);
        const balanceAfterQ = fromU128(tr.balanceAfter);
        const linkIdNum = Number(tr.linkId ?? 0n);

        return {
            txId: tr.txId,
            assetId: tr.assetId,
            amountQ: amountQ.toString(),
            balanceAfterQ: balanceAfterQ !== 0n ? balanceAfterQ.toString() : undefined,
            type: transferTypeNameFor(tr.type),
            accountCode: accountCodeNameFor(tr.accountCode),
            pending: tr.pending,
            onchain: tr.onchain,
            timestamp: tsNsToMs(tr.timestamp),
            isDebit: tr.isDebit,
            linkId: linkIdNum || undefined,
            flowId: tr.flowId?.trim() ?? "",
        };
    }),
);

export function createLedgerTransferSchema() {
    return LedgerTransferSchema;
}

export type LedgerTransfer = v.InferOutput<ReturnType<typeof createLedgerTransferSchema>>;

export const ListTransfersInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        ledger: v.optional(v.number(), 0),
        limit: v.optional(v.number()),
        reversed: v.optional(v.boolean(), false),
        timestampMin: OptionalTimestampMsToNsInputSchema,
        timestampMax: OptionalTimestampMsToNsInputSchema,
        code: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0xffffffff))),
        since: v.pipe(
            v.optional(v.number(), 0),
            v.transform((v) => BigInt(v ?? 0)),
        ),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListTransfersInput = v.InferInput<typeof ListTransfersInputSchema>;
