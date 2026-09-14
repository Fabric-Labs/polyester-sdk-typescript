import { TradingWithdrawAction } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { ValidationError } from "../../shared/errors.js";
import { isEvmAddress } from "../../utils/evm.js";
import type { TradingWithdrawIntentPayloadRequest } from "./trading-withdraws.schemas.js";
import type { TradingWithdrawSigningConfig } from "./trading-withdraws.js";

function messageAddress(value: string, field: string): string {
    const address = value.trim();
    if (!isEvmAddress(address)) {
        throw new ValidationError(`Trading withdraw ${field} must be a valid EVM address.`);
    }
    return address.toLowerCase();
}

function messageText(value: string, field: string): string {
    const text = value.trim();
    if (/[\p{Cc}\p{Cs}]/u.test(text)) {
        throw new ValidationError(
            `Trading withdraw ${field} must be valid UTF-8 without control characters.`,
        );
    }
    return text;
}

export function buildTradingWithdrawWalletMessage(params: {
    signingConfig: TradingWithdrawSigningConfig;
    payload: TradingWithdrawIntentPayloadRequest;
    signerWallet: string;
    accountId: bigint;
    targetAccountId: bigint;
}): string {
    const { payload, signingConfig } = params;
    if (!Number.isSafeInteger(signingConfig.chainId) || signingConfig.chainId <= 0) {
        throw new ValidationError("Trading withdraw chain ID must be a positive safe integer.");
    }
    const action =
        payload.action === TradingWithdrawAction.TO_FUNDING
            ? "TO_FUNDING"
            : payload.action === TradingWithdrawAction.TO_EXTERNAL_CHAIN
              ? "TO_EXTERNAL_CHAIN"
              : undefined;
    if (!action) throw new ValidationError("Invalid trading withdraw action.");

    return [
        "Polyester Trading Withdrawal",
        "",
        "Version: 1",
        "Environment: polyester",
        `Action: ${action}`,
        `Signer Wallet: ${messageAddress(params.signerWallet, "signer wallet")}`,
        `Account ID: ${params.accountId}`,
        `Target Account ID: ${params.targetAccountId}`,
        `Asset ID: ${payload.assetId}`,
        `Polyester Chain ID: ${signingConfig.chainId}`,
        `Destination Chain ID: ${payload.destinationChainId}`,
        `Amount E18: ${(payload.amountE18.hi << 64n) + payload.amountE18.lo}`,
        `Destination: ${messageText(payload.destinationAddress, "destination")}`,
        `Verifying Contract: ${messageAddress(signingConfig.tradingGatewayAddress, "verifying contract")}`,
        `Deadline: ${payload.deadlineTsSec}`,
        `Nonce: ${(payload.nonce.hi << 64n) + payload.nonce.lo}`,
        `Idempotency Key: ${messageText(payload.idempotencyKey, "idempotency key")}`,
    ].join("\n");
}
