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
    "trading_withdraw_fee_leg",
    "quickswap_polyester_fee",
    "quickswap_broker_fee",
    "quickswap_affiliate_fee",
    "fee_sweep",
    "fee_refill",
    "system_adjustment",
    "withdraw_failed",
] as const;
/**
 * Ledger transfer type. `system_adjustment` can credit or debit the account (a seeding credit
 * or a correction), so read the row's `isDebit` for its direction. `withdraw_failed` is funds that
 * left the account for a withdrawal that was rejected or failed to execute; its fee is not
 * refunded.
 */
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
        trading_withdraw_fee_leg: TransferCode.TRADING_WITHDRAW_FEE_LEG,
        quickswap_polyester_fee: TransferCode.QUICKSWAP_POLYESTER_FEE,
        quickswap_broker_fee: TransferCode.QUICKSWAP_BROKER_FEE,
        quickswap_affiliate_fee: TransferCode.QUICKSWAP_AFFILIATE_FEE,
        fee_sweep: TransferCode.FEE_SWEEP,
        fee_refill: TransferCode.FEE_REFILL,
        system_adjustment: TransferCode.SYSTEM_ADJUSTMENT,
        withdraw_failed: TransferCode.WITHDRAW_FAILED,
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
        [TransferCode.TRADING_WITHDRAW_FEE_LEG]: "trading_withdraw_fee_leg",
        [TransferCode.QUICKSWAP_POLYESTER_FEE]: "quickswap_polyester_fee",
        [TransferCode.QUICKSWAP_BROKER_FEE]: "quickswap_broker_fee",
        [TransferCode.QUICKSWAP_AFFILIATE_FEE]: "quickswap_affiliate_fee",
        [TransferCode.FEE_SWEEP]: "fee_sweep",
        [TransferCode.FEE_REFILL]: "fee_refill",
        [TransferCode.SYSTEM_ADJUSTMENT]: "system_adjustment",
        [TransferCode.WITHDRAW_FAILED]: "withdraw_failed",
    } satisfies ProtoToOutput<TransferCode, TransferCodeValue>,
} as const;
