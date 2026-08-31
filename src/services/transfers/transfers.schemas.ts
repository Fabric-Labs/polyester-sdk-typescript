import * as v from "valibot";
import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { fromU128 } from "../../utils/u128.js";
import {
    AccountCodeCodec,
    TRANSFER_CODE_VALUES,
    TransferCodeCodec,
} from "../../shared/ledger-codes.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { wireTimestampToMs } from "../../utils/time.js";
import {
    OptionalPublicIdSchema,
    OptionalTimestampMsToUsInputSchema,
} from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { E18_SCALE, scaledToDecimalOutput } from "../../shared/decimal-surface.js";
import { TransferSideKindCodec } from "./transfers.codecs.js";

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

const WireTimestampInputSchema = v.union([
    v.bigint(),
    v.number(),
    v.pipe(
        v.string(),
        v.regex(/^\d+$/),
        v.transform((value) => BigInt(value)),
    ),
]);

const TransferSideKindSchema = v.pipe(
    v.enum(Proto.TransferSideKind),
    v.transform((kind) =>
        requiredEnumLabel(TransferSideKindCodec.protoToOutput, kind, "TransferSideSchema", "kind"),
    ),
);

export const LedgerTransferSideSchema = v.object({
    kind: TransferSideKindSchema,
    accountId: OptionalPublicIdSchema,
    address: v.optional(v.string(), ""),
    chainId: v.optional(v.number()),
});

export type LedgerTransferSide = v.InferOutput<typeof LedgerTransferSideSchema>;

/** Parses ledger transfer rows whose monetary fields use the protocol's fixed E18 scale. */
export const LedgerTransferSchema = v.pipe(
    v.object({
        assetId: v.number(),
        amountE18: v.optional(U128Schema),
        balanceAfterE18: v.optional(U128Schema),
        isDebit: v.boolean(),
        transferCode: v.number(),
        accountCode: v.number(),
        tsUs: WireTimestampInputSchema,
        linkId: v.optional(v.bigint()),
        flowId: v.optional(v.string()),
        source: v.optional(LedgerTransferSideSchema),
        destination: v.optional(LedgerTransferSideSchema),
    }),
    v.transform((tr) => {
        const amount = fromU128(tr.amountE18);
        const linkId = tr.linkId && tr.linkId > 0n ? tr.linkId.toString() : undefined;

        const output = {
            assetId: tr.assetId,
            amount: scaledToDecimalOutput(amount, E18_SCALE),
            balanceAfter:
                tr.balanceAfterE18 !== undefined
                    ? scaledToDecimalOutput(fromU128(tr.balanceAfterE18), E18_SCALE)
                    : undefined,
            type: requiredEnumLabel(
                TransferCodeCodec.protoToOutput,
                tr.transferCode,
                "LedgerTransferSchema",
                "transfer code",
            ),
            accountCode: requiredEnumLabel(
                AccountCodeCodec.protoToOutput,
                tr.accountCode,
                "LedgerTransferSchema",
                "account code",
            ),
            timestamp: wireTimestampToMs(tr.tsUs),
            isDebit: tr.isDebit,
            linkId,
            flowId: tr.flowId?.trim() ?? "",
        };

        return {
            ...output,
            ...(tr.source ? { source: tr.source } : {}),
            ...(tr.destination ? { destination: tr.destination } : {}),
        };
    }),
);

export type LedgerTransfer = v.InferOutput<typeof LedgerTransferSchema>;

export const ListTransfersInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        ledger: v.optional(v.number(), 0),
        limit: v.optional(v.number()),
        reversed: v.optional(v.boolean(), false),
        timestampMin: OptionalTimestampMsToUsInputSchema,
        timestampMax: OptionalTimestampMsToUsInputSchema,
        transferCode: v.optional(
            v.pipe(
                v.picklist(TRANSFER_CODE_VALUES),
                v.transform((value) => TransferCodeCodec.inputToProto[value]),
            ),
        ),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, timestampMin, timestampMax, ...input }) => ({
        ...input,
        tsMinUs: timestampMin,
        tsMaxUs: timestampMax,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListTransfersInput = v.InferInput<typeof ListTransfersInputSchema>;
