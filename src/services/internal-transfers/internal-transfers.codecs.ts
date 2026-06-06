export const INTERNAL_TRANSFER_DESTINATION_TYPE_VALUES = [
	"account",
	"subAccount",
	"smartAccountAddress",
] as const;

export type InternalTransferDestinationType =
	(typeof INTERNAL_TRANSFER_DESTINATION_TYPE_VALUES)[number];

export const InternalTransferDestinationCodec = {
	inputToProtoCase: {
		account: "destinationAccountId",
		subAccount: "destinationSubaccountId",
		smartAccountAddress: "destinationSmartAccountAddress",
	} satisfies Record<
		InternalTransferDestinationType,
		"destinationAccountId" | "destinationSubaccountId" | "destinationSmartAccountAddress"
	>,
} as const;
