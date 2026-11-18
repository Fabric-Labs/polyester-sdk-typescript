import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    BigIntStringSchema,
    OptionalPublicIdSchema,
    OptionalTimestampMsSchema,
    PublicIdSchema,
    TimestampMsSchema,
    idInputSchema,
} from "../../shared/schemas.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import { msToTimestamp } from "../../utils/timestamp.js";
import {
    StatementExportFailureReasonCodec,
    StatementExportStatusCodec,
} from "./statement-exports.codecs.js";

/** Latest period end the server accepts: 2262-04-11T23:47:16Z, the int64-nanosecond limit. */
const LATEST_END_TIME_MS = Date.UTC(2262, 3, 11, 23, 47, 16);

const IdempotencyKeySchema = v.pipe(
    v.string(),
    v.regex(
        /^[A-Za-z0-9._:-]{1,64}$/u,
        "idempotencyKey must be 1 to 64 letters, digits, '.', '_', ':' or '-'.",
    ),
);

export const CreateStatementExportInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** Period start, inclusive, in epoch milliseconds (UTC); after the epoch and not in the future. */
        startTime: v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1, "startTime must be after 1970-01-01T00:00:00Z."),
        ),
        /**
         * Period end, exclusive, in epoch milliseconds (UTC), by 2262-04-11T23:47:16Z and at most
         * 366 days after `startTime`. A period still open when the export is created ends then;
         * see `completeThrough`.
         */
        endTime: v.pipe(
            v.number(),
            v.integer(),
            v.maxValue(LATEST_END_TIME_MS, "endTime must be by 2262-04-11T23:47:16Z."),
        ),
        /** Ledger asset ID to cover only that asset; omit or `0` for every asset. */
        assetId: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(PROTOBUF_UINT32_MAX)),
            0,
        ),
        /**
         * 1 to 64 letters, digits, `.`, `_`, `:` or `-`, unique per root account. Repeating the
         * request with the same key returns the same export; the same key with other fields
         * throws `PreconditionFailedError` (`IDEMPOTENCY_KEY_REUSED`).
         */
        idempotencyKey: IdempotencyKeySchema,
    }),
    v.check(({ startTime, endTime }) => endTime > startTime, "endTime must be after startTime."),
    v.transform(({ account, startTime, endTime, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
        startTime: msToTimestamp(startTime),
        endTime: msToTimestamp(endTime),
    })),
);

export type CreateStatementExportInput = v.InferInput<typeof CreateStatementExportInputSchema>;

export const GetStatementExportInputSchema = v.strictObject({
    exportId: idInputSchema("exportId"),
});

export type GetStatementExportInput = v.InferInput<typeof GetStatementExportInputSchema>;
export type CancelStatementExportInput = GetStatementExportInput;
export type GetStatementExportDownloadUrlInput = GetStatementExportInput;

export const ListStatementExportsInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** Page size, at most 100; 0 or omitted uses the server default of 20. */
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 0),
        /** Previous `nextPageToken`; reuse only with the same account. */
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListStatementExportsInput = v.InferInput<typeof ListStatementExportsInputSchema>;

/** A whole-period statement file being produced, ready, failed or expired. Times are epoch ms. */
export const StatementExportSchema = v.pipe(
    v.object({
        exportId: PublicIdSchema,
        subaccountId: OptionalPublicIdSchema,
        startTime: TimestampMsSchema,
        endTime: TimestampMsSchema,
        assetId: v.number(),
        idempotencyKey: v.string(),
        status: enumLabelSchema(StatementExportStatusCodec.protoToOutput),
        completeThrough: TimestampMsSchema,
        movements: BigIntStringSchema,
        bytes: BigIntStringSchema,
        createdAt: TimestampMsSchema,
        readyAt: OptionalTimestampMsSchema,
        expiresAt: OptionalTimestampMsSchema,
        failureReason: enumLabelSchema(StatementExportFailureReasonCodec.protoToOutput),
    }),
    v.transform((statement) => ({
        exportId: statement.exportId,
        /** Public subaccount ID the statement covers; null for the root account. */
        subaccountId: statement.subaccountId ?? null,
        /** Period start, inclusive. */
        startTime: statement.startTime,
        /** Requested period end, exclusive. */
        endTime: statement.endTime,
        /** Ledger asset ID the statement is limited to; 0 for every asset. */
        assetId: statement.assetId,
        idempotencyKey: statement.idempotencyKey,
        status: statement.status,
        /**
         * End of what the file covers, exclusive: the earlier of `endTime` and when the export
         * was created. Every movement recorded before both is in the file.
         */
        completeThrough: statement.completeThrough,
        /** Ledger movements written so far, as a uint64 decimal string; the total once ready. */
        movements: statement.movements,
        /** Bytes written so far, as a uint64 decimal string; the file size once ready. */
        bytes: statement.bytes,
        createdAt: statement.createdAt,
        /** When the file became ready; null before. */
        readyAt: statement.readyAt ?? null,
        /** When a ready file expires, 7 days after `readyAt`; null before ready. */
        expiresAt: statement.expiresAt ?? null,
        /** Why the export failed; `unspecified` unless `status` is `failed`. */
        failureReason: statement.failureReason,
    })),
);

export type StatementExport = v.InferOutput<typeof StatementExportSchema>;

export const ListStatementExportsResultSchema = v.object({
    exports: v.array(StatementExportSchema),
    nextPageToken: v.optional(v.string(), ""),
    /**
     * Exports queued or processing across the whole root account, subaccounts included,
     * whichever account the list selects.
     */
    inProgressExports: v.optional(v.number(), 0),
    /** Most exports the root account may have queued or processing; `create` refuses at it. */
    maxInProgressExports: v.optional(v.number(), 0),
});

/** One page of exports, newest first; an empty `nextPageToken` means no more. */
export type ListStatementExportsResult = v.InferOutput<typeof ListStatementExportsResultSchema>;

export const StatementExportDownloadUrlSchema = v.object({
    /**
     * Link to the file that needs no credentials, for a browser to save. Anyone who holds it can
     * download the file until `expiresAt`: do not share, store or log it.
     */
    url: v.string(),
    /** When the link stops working, epoch ms: 60 seconds after signing or when the file expires. */
    expiresAt: TimestampMsSchema,
    /** Name the download saves the file as, `statement-<exportId>.csv`. */
    filename: v.string(),
});

export type StatementExportDownloadUrl = v.InferOutput<typeof StatementExportDownloadUrlSchema>;
