import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import type { ProtoToOutput } from "../../utils/types.js";

export const TRADING_WITHDRAW_ACTION_VALUES = ["to_funding", "to_external_chain"] as const;
export type TradingWithdrawActionValue = (typeof TRADING_WITHDRAW_ACTION_VALUES)[number];

export const WITHDRAW_DESTINATION_VALIDATION_CODE_VALUES = [
    "valid",
    "invalid_address",
    "unsupported_chain",
    "polyester_smart_account",
    "token_contract",
    "denylisted_address",
    "swap_deposit_address",
] as const;
export type WithdrawDestinationValidationCodeValue =
    (typeof WITHDRAW_DESTINATION_VALIDATION_CODE_VALUES)[number];

export const WALLET_ASSET_UNAVAILABLE_REASON_VALUES = [
    "no_contract",
    "read_failed",
    "invalid_balance",
] as const;
/** Why a zToken balance could not be read. */
export type WalletAssetUnavailableReasonValue =
    (typeof WALLET_ASSET_UNAVAILABLE_REASON_VALUES)[number];

export const TradingWithdrawActionCodec = {
    inputToProto: {
        to_funding: Proto.TradingWithdrawAction.TO_FUNDING,
        to_external_chain: Proto.TradingWithdrawAction.TO_EXTERNAL_CHAIN,
    } satisfies Record<TradingWithdrawActionValue, Proto.TradingWithdrawAction>,
} as const;

export const WithdrawDestinationValidationCodeCodec = {
    protoToOutput: {
        [Proto.WithdrawDestinationValidationCode.RESULT_UNSPECIFIED]: "unspecified",
        [Proto.WithdrawDestinationValidationCode.VALID]: "valid",
        [Proto.WithdrawDestinationValidationCode.INVALID_ADDRESS]: "invalid_address",
        [Proto.WithdrawDestinationValidationCode.UNSUPPORTED_CHAIN]: "unsupported_chain",
        [Proto.WithdrawDestinationValidationCode.POLYESTER_SMART_ACCOUNT]:
            "polyester_smart_account",
        [Proto.WithdrawDestinationValidationCode.TOKEN_CONTRACT]: "token_contract",
        [Proto.WithdrawDestinationValidationCode.DENYLISTED_ADDRESS]: "denylisted_address",
        [Proto.WithdrawDestinationValidationCode.SWAP_DEPOSIT_ADDRESS]: "swap_deposit_address",
    } satisfies ProtoToOutput<
        Proto.WithdrawDestinationValidationCode,
        WithdrawDestinationValidationCodeValue
    >,
} as const;

export const WalletAssetUnavailableReasonCodec = {
    protoToOutput: {
        [Proto.WalletAssetUnavailableReason.UNAVAILABLE_UNSPECIFIED]: "unspecified",
        [Proto.WalletAssetUnavailableReason.NO_CONTRACT]: "no_contract",
        [Proto.WalletAssetUnavailableReason.READ_FAILED]: "read_failed",
        [Proto.WalletAssetUnavailableReason.INVALID_BALANCE]: "invalid_balance",
    } satisfies ProtoToOutput<
        Proto.WalletAssetUnavailableReason,
        WalletAssetUnavailableReasonValue
    >,
} as const;
