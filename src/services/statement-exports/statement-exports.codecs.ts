import * as Proto from "../../gen/ledger/read/v1/statement_export_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

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

export const STATEMENT_EXPORT_FAILURE_REASON_VALUES = [
    "too_large",
    "unavailable",
    "history_unavailable",
] as const;
/**
 * `too_large`: the period holds more than 4,000,000 of the account's ledger movements, every
 * asset's counted even for an export limited to one asset; split it into shorter exports.
 * `unavailable`: the file could not be produced in time; create a new export.
 * `history_unavailable`: a `balances` export's period starts before the account history, which
 * moved later after the export was created; create a new export starting at or after
 * `historyAvailableFrom`.
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
        [Proto.StatementExportFailureReason.HISTORY_UNAVAILABLE]: "history_unavailable",
    } satisfies ProtoToOutput<Proto.StatementExportFailureReason, StatementExportFailureReason>,
} as const;

export const STATEMENT_EXPORT_TYPE_VALUES = ["account_statement", "ledger", "balances"] as const;
/**
 * The file an export produces: `account_statement` has one row per entry, account bucket and
 * asset; `ledger` one row per ledger movement, each transfer leg on its own; `balances` one row
 * per account bucket and asset with its opening and closing balances, and its period must start
 * inside the account history.
 */
export type StatementExportType = (typeof STATEMENT_EXPORT_TYPE_VALUES)[number];

export const StatementExportTypeCodec = {
    inputToProto: {
        account_statement: Proto.StatementExportType.ACCOUNT_STATEMENT,
        ledger: Proto.StatementExportType.LEDGER,
        balances: Proto.StatementExportType.BALANCES,
    } satisfies InputToProto<StatementExportType, Proto.StatementExportType>,
    protoToOutput: {
        [Proto.StatementExportType.STATEMENT_EXPORT_TYPE_UNSPECIFIED]: "unspecified",
        [Proto.StatementExportType.ACCOUNT_STATEMENT]: "account_statement",
        [Proto.StatementExportType.LEDGER]: "ledger",
        [Proto.StatementExportType.BALANCES]: "balances",
    } satisfies ProtoToOutput<Proto.StatementExportType, StatementExportType>,
} as const;
