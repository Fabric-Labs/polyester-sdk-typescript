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

export const InternalTransferStatusCodec = {
    protoToOutput: {
        [Proto.InternalTransferStatus.UNSPECIFIED]: "unspecified",
        [Proto.InternalTransferStatus.ACCEPTED]: "accepted",
        [Proto.InternalTransferStatus.REJECTED]: "rejected",
        [Proto.InternalTransferStatus.FAILED]: "failed",
    } satisfies ProtoToOutput<Proto.InternalTransferStatus, InternalTransferStatus>,
} as const;
