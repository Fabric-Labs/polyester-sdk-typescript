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

export const INTERNAL_TRANSFER_BATCH_STATUS_VALUES = ["submitted", "refused"] as const;

/** `"submitted"`: every leg passed its checks and ran; `"refused"`: no leg ran and nothing moved. */
export type InternalTransferBatchStatus = (typeof INTERNAL_TRANSFER_BATCH_STATUS_VALUES)[number];

export const InternalTransferBatchStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferBatchStatus.BATCH_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferBatchStatus.BATCH_SUBMITTED]: "submitted",
        [Proto.InternalTransferBatchStatus.BATCH_REFUSED]: "refused",
    } satisfies ProtoToOutput<Proto.InternalTransferBatchStatus, InternalTransferBatchStatus>,
} as const;

export const INTERNAL_TRANSFER_BATCH_LEG_STATUS_VALUES = [
    "accepted",
    "pending",
    "refused",
    "not_submitted",
] as const;

/**
 * `"pending"`: the outcome is not known yet; read it with `internalTransfers.get` by the leg's
 * `requestId`, or retry the batch with the same idempotency key. A retry also runs `"refused"`
 * and `"not_submitted"` legs again.
 */
export type InternalTransferBatchLegStatus =
    (typeof INTERNAL_TRANSFER_BATCH_LEG_STATUS_VALUES)[number];

export const InternalTransferBatchLegStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferBatchLegStatus.LEG_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferBatchLegStatus.LEG_ACCEPTED]: "accepted",
        [Proto.InternalTransferBatchLegStatus.LEG_PENDING]: "pending",
        [Proto.InternalTransferBatchLegStatus.LEG_REFUSED]: "refused",
        [Proto.InternalTransferBatchLegStatus.LEG_NOT_SUBMITTED]: "not_submitted",
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
