import * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const INTERNAL_TRANSFER_DESTINATION_TYPE_VALUES = [
    "account",
    "subaccount",
    "smartAccountAddress",
] as const;

export type InternalTransferDestinationType =
    (typeof INTERNAL_TRANSFER_DESTINATION_TYPE_VALUES)[number];

export const InternalTransferDestinationCodec = {
    inputToProtoCase: {
        account: "destinationAccountId",
        subaccount: "destinationSubaccountId",
        smartAccountAddress: "destinationSmartAccountAddress",
    } satisfies Record<
        InternalTransferDestinationType,
        "destinationAccountId" | "destinationSubaccountId" | "destinationSmartAccountAddress"
    >,
} as const;

export const INTERNAL_TRANSFER_STATUS_VALUES = ["accepted", "rejected", "failed"] as const;

export type InternalTransferStatus = (typeof INTERNAL_TRANSFER_STATUS_VALUES)[number];

export const INTERNAL_TRANSFER_BATCH_STATUS_VALUES = ["refused", "processing", "accepted"] as const;

/**
 * `"accepted"`: every leg is credited. `"refused"`: nothing moved, and nothing will under this
 * idempotency key. `"processing"`: the outcome is not known yet; the batch completes on its own,
 * ending accepted or refused. Read it with `internalTransfers.getBatch` by its `requestId` or
 * idempotency key, or retry with the same idempotency key.
 */
export type InternalTransferBatchStatus = (typeof INTERNAL_TRANSFER_BATCH_STATUS_VALUES)[number];

export const InternalTransferBatchStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferBatchStatus.BATCH_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferBatchStatus.BATCH_REFUSED]: "refused",
        [Proto.InternalTransferBatchStatus.BATCH_PROCESSING]: "processing",
        [Proto.InternalTransferBatchStatus.BATCH_ACCEPTED]: "accepted",
    } satisfies ProtoToOutput<Proto.InternalTransferBatchStatus, InternalTransferBatchStatus>,
} as const;

export const INTERNAL_TRANSFER_BATCH_LEG_STATUS_VALUES = [
    "processing",
    "credited",
    "not_moved",
] as const;

/**
 * `"processing"`: the leg's outcome is its batch's, not known yet. `"credited"`: credited to its
 * destination. `"not_moved"`: its batch was refused; `errorCode` is set on the legs that caused
 * the refusal.
 */
export type InternalTransferBatchLegStatus =
    (typeof INTERNAL_TRANSFER_BATCH_LEG_STATUS_VALUES)[number];

export const InternalTransferBatchLegStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferBatchLegStatus.LEG_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferBatchLegStatus.LEG_PROCESSING]: "processing",
        [Proto.InternalTransferBatchLegStatus.LEG_CREDITED]: "credited",
        [Proto.InternalTransferBatchLegStatus.LEG_NOT_MOVED]: "not_moved",
    } satisfies ProtoToOutput<Proto.InternalTransferBatchLegStatus, InternalTransferBatchLegStatus>,
} as const;

export type InternalTransferErrorCode = keyof typeof Proto.ErrorCode;

/**
 * Names a transfer error code like the `internal_transfer` error detail does. A code newer
 * than this build reads as `"UNSPECIFIED"` instead of failing the whole response.
 */
export function internalTransferErrorCodeName(code: number): InternalTransferErrorCode {
    const name: unknown = Proto.ErrorCode[code];
    return typeof name === "string" ? (name as InternalTransferErrorCode) : "UNSPECIFIED";
}

export const InternalTransferStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferStatus.UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferStatus.ACCEPTED]: "accepted",
        [Proto.InternalTransferStatus.REJECTED]: "rejected",
        [Proto.InternalTransferStatus.FAILED]: "failed",
    } satisfies ProtoToOutput<Proto.InternalTransferStatus, InternalTransferStatus>,
} as const;
