import * as Proto from "../../gen/ledger/read/v1/statement_export_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const STATEMENT_EXPORT_STATUS_VALUES = [
    "queued",
    "processing",
    "ready",
    "failed",
    "expired",
    "canceled",
] as const;
/**
 * `queued` waits for the account history to cover the period and for the account's other
 * export to finish, `processing` is writing the file, `ready` can be downloaded until
 * `expiresAt`, `failed` has no file (see `failureReason`), `expired` had its file deleted, and
 * `canceled` was stopped with `statementExports.cancel` before it finished and has no file.
 */
export type StatementExportStatus = (typeof STATEMENT_EXPORT_STATUS_VALUES)[number];

export const STATEMENT_EXPORT_FAILURE_REASON_VALUES = ["too_large", "unavailable"] as const;
/**
 * `too_large`: the period holds more than 4,000,000 ledger movements; split it into shorter
 * exports. `unavailable`: the file could not be produced in time; create a new export.
 */
export type StatementExportFailureReason = (typeof STATEMENT_EXPORT_FAILURE_REASON_VALUES)[number];

export const StatementExportStatusCodec = {
    protoToOutput: {
        [Proto.StatementExportStatus.UNSPECIFIED]: "unspecified",
        [Proto.StatementExportStatus.QUEUED]: "queued",
        [Proto.StatementExportStatus.PROCESSING]: "processing",
        [Proto.StatementExportStatus.READY]: "ready",
        [Proto.StatementExportStatus.FAILED]: "failed",
        [Proto.StatementExportStatus.EXPIRED]: "expired",
        [Proto.StatementExportStatus.CANCELED]: "canceled",
    } satisfies ProtoToOutput<Proto.StatementExportStatus, StatementExportStatus>,
} as const;

export const StatementExportFailureReasonCodec = {
    protoToOutput: {
        [Proto.StatementExportFailureReason.UNSPECIFIED]: "unspecified",
        [Proto.StatementExportFailureReason.TOO_LARGE]: "too_large",
        [Proto.StatementExportFailureReason.UNAVAILABLE]: "unavailable",
    } satisfies ProtoToOutput<Proto.StatementExportFailureReason, StatementExportFailureReason>,
} as const;
