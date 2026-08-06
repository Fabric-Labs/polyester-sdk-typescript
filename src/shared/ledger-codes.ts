import { AccountCode, TransferCode } from "../gen/ledger/v1/catalog_pb.js";
import type { InputToProto, ProtoToOutput } from "../utils/types.js";

export const ACCOUNT_CODE_VALUES = ["funding", "trading"] as const;
export type AccountCodeValue = (typeof ACCOUNT_CODE_VALUES)[number];

export const TRANSFER_CODE_VALUES = [
    "deposit",
    "withdraw",
    "maker_fee",
    "taker_fee",
    "internal_transfer",
    "trade_base",
    "trade_quote",
    "rebate",
    "funding_to_trading",
    "trading_to_funding",
    "trading_withdraw_reserve",
    "funding_user_transfer",
    "trading_withdraw_request_fee",
] as const;
export type TransferCodeValue = (typeof TRANSFER_CODE_VALUES)[number];

export const AccountCodeCodec = {
    inputToProto: {
        funding: AccountCode.FUNDING,
        trading: AccountCode.TRADING,
    } satisfies InputToProto<AccountCodeValue, AccountCode>,
    protoToOutput: {
        [AccountCode.ACCOUNT_CODE_UNSPECIFIED]: "unspecified",
        [AccountCode.FUNDING]: "funding",
        [AccountCode.TRADING]: "trading",
    } satisfies ProtoToOutput<AccountCode, AccountCodeValue>,
} as const;

export const TransferCodeCodec = {
    inputToProto: {
        deposit: TransferCode.DEPOSIT,
        withdraw: TransferCode.WITHDRAW,
        maker_fee: TransferCode.MAKER_FEE,
        taker_fee: TransferCode.TAKER_FEE,
        internal_transfer: TransferCode.INTERNAL_TRANSFER,
        trade_base: TransferCode.TRADE_BASE,
        trade_quote: TransferCode.TRADE_QUOTE,
        rebate: TransferCode.REBATE,
        funding_to_trading: TransferCode.FUNDING_TO_TRADING,
        trading_to_funding: TransferCode.TRADING_TO_FUNDING,
        trading_withdraw_reserve: TransferCode.TRADING_WITHDRAW_RESERVE,
        funding_user_transfer: TransferCode.FUNDING_USER_TRANSFER,
        trading_withdraw_request_fee: TransferCode.TRADING_WITHDRAW_REQUEST_FEE,
    } satisfies InputToProto<TransferCodeValue, TransferCode>,
    protoToOutput: {
        [TransferCode.TRANSFER_CODE_UNSPECIFIED]: "unspecified",
        [TransferCode.DEPOSIT]: "deposit",
        [TransferCode.WITHDRAW]: "withdraw",
        [TransferCode.MAKER_FEE]: "maker_fee",
        [TransferCode.TAKER_FEE]: "taker_fee",
        [TransferCode.INTERNAL_TRANSFER]: "internal_transfer",
        [TransferCode.TRADE_BASE]: "trade_base",
        [TransferCode.TRADE_QUOTE]: "trade_quote",
        [TransferCode.REBATE]: "rebate",
        [TransferCode.FUNDING_TO_TRADING]: "funding_to_trading",
        [TransferCode.TRADING_TO_FUNDING]: "trading_to_funding",
        [TransferCode.TRADING_WITHDRAW_RESERVE]: "trading_withdraw_reserve",
        [TransferCode.FUNDING_USER_TRANSFER]: "funding_user_transfer",
        [TransferCode.TRADING_WITHDRAW_REQUEST_FEE]: "trading_withdraw_request_fee",
    } satisfies ProtoToOutput<TransferCode, TransferCodeValue>,
} as const;
