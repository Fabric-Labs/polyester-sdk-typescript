import * as Proto from "../../gen/ledger/read/v1/ledger_read_pb.js";

export const TRANSFER_SIDE_KIND_VALUES = [
    "unspecified",
    "funding_account",
    "trading_account",
    "external_address",
    "private_counterparty",
    "fee_account",
    "system_account",
] as const;

export type TransferSideKind = (typeof TRANSFER_SIDE_KIND_VALUES)[number];

export const TransferSideKindCodec = {
    protoToOutput: {
        [Proto.TransferSideKind.TRANSFER_SIDE_KIND_UNSPECIFIED]: "unspecified",
        [Proto.TransferSideKind.FUNDING_ACCOUNT]: "funding_account",
        [Proto.TransferSideKind.TRADING_ACCOUNT]: "trading_account",
        [Proto.TransferSideKind.EXTERNAL_ADDRESS]: "external_address",
        [Proto.TransferSideKind.PRIVATE_COUNTERPARTY]: "private_counterparty",
        [Proto.TransferSideKind.FEE_ACCOUNT]: "fee_account",
        [Proto.TransferSideKind.SYSTEM_ACCOUNT]: "system_account",
    } satisfies Record<Proto.TransferSideKind, TransferSideKind>,
} as const;
