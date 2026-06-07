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
