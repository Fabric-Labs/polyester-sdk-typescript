import * as v from "valibot";
import { quantityInputToE18, type SdkScales } from "../../shared/decimal-surface.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import type * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { toU128, type U128Value } from "../../utils/u128.js";
import { TradingWithdrawActionCodec } from "./trading-withdraws.codecs.js";

const DEFAULT_DEADLINE_SECONDS = 5 * 60;

export type TradingWithdrawIntentPayloadRequest = {
    action: Proto.TradingWithdrawAction;
    assetId: number;
    destinationChainId: bigint;
    amountE18: U128Value;
    deadlineTsSec: bigint;
    nonce: U128Value;
    destinationAddress: string;
    idempotencyKey: string;
};

type CreateTradingWithdrawRequestBase = {
    subaccountId: bigint | undefined;
    payload: TradingWithdrawIntentPayloadRequest;
    payloadSignature?: Uint8Array;
};

function createNonce(): bigint {
    const random = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
    if (!random) {
        const nonce = BigInt(Date.now());
        return nonce === 0n ? 1n : nonce;
    }

    const bytes = new BigUint64Array(1);
    random(bytes);
    const nonce = bytes[0] ?? BigInt(Date.now());
    return nonce === 0n ? 1n : nonce;
}

function createTradingWithdrawPayload(input: {
    action: Proto.TradingWithdrawAction;
    assetId: number;
    destinationChainId: bigint;
    quantityScaled: bigint;
    destinationAddress: string;
    idempotencyKey: string;
}): TradingWithdrawIntentPayloadRequest {
    return {
        action: input.action,
        assetId: input.assetId,
        destinationChainId: input.destinationChainId,
        amountE18: toU128(input.quantityScaled),
        deadlineTsSec: BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS),
        nonce: toU128(createNonce()),
        destinationAddress: input.destinationAddress,
        idempotencyKey: input.idempotencyKey,
    };
}

export function createCreateTradingWithdrawToFundingInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...AccountScopeInputEntries,
            assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
            quantity: v.string(),
            idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
            destinationAddress: v.optional(v.pipe(v.string(), v.trim()), ""),
            signerWallet: v.optional(v.pipe(v.string(), v.trim()), ""),
            payloadSignature: v.optional(v.instance(Uint8Array)),
        }),
        v.transform((input): CreateTradingWithdrawRequestBase => {
            const quantityScaled = quantityInputToE18({
                scales,
                assetId: input.assetId,
                quantity: input.quantity,
            });
            return {
                subaccountId: accountScopeToSubaccountId(input.account),
                payloadSignature: input.payloadSignature,
                payload: createTradingWithdrawPayload({
                    action: TradingWithdrawActionCodec.inputToProto.to_funding,
                    assetId: input.assetId,
                    destinationChainId: 0n,
                    quantityScaled,
                    destinationAddress: input.destinationAddress,
                    idempotencyKey: input.idempotencyKey,
                }),
            };
        }),
    );
}

export function createCreateTradingWithdrawToExternalChainInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...AccountScopeInputEntries,
            assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
            quantity: v.string(),
            destinationChainId: v.pipe(
                v.number(),
                v.integer(),
                v.gtValue(0),
                v.maxValue(Number.MAX_SAFE_INTEGER),
            ),
            destinationAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
            idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
            signerWallet: v.optional(v.pipe(v.string(), v.trim()), ""),
            payloadSignature: v.optional(v.instance(Uint8Array)),
        }),
        v.transform((input): CreateTradingWithdrawRequestBase => {
            const quantityScaled = quantityInputToE18({
                scales,
                assetId: input.assetId,
                quantity: input.quantity,
            });
            return {
                subaccountId: accountScopeToSubaccountId(input.account),
                payloadSignature: input.payloadSignature,
                payload: createTradingWithdrawPayload({
                    action: TradingWithdrawActionCodec.inputToProto.to_external_chain,
                    assetId: input.assetId,
                    destinationChainId: BigInt(input.destinationChainId),
                    quantityScaled,
                    destinationAddress: input.destinationAddress,
                    idempotencyKey: input.idempotencyKey,
                }),
            };
        }),
    );
}

export type CreateTradingWithdrawToFundingInput = v.InferInput<
    ReturnType<typeof createCreateTradingWithdrawToFundingInputSchema>
>;

export type CreateTradingWithdrawToFundingRequest = v.InferOutput<
    ReturnType<typeof createCreateTradingWithdrawToFundingInputSchema>
>;

export type CreateTradingWithdrawToExternalChainInput = v.InferInput<
    ReturnType<typeof createCreateTradingWithdrawToExternalChainInputSchema>
>;

export type CreateTradingWithdrawToExternalChainRequest = v.InferOutput<
    ReturnType<typeof createCreateTradingWithdrawToExternalChainInputSchema>
>;

export const CreateTradingWithdrawResultSchema = v.object({
    intentId: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type CreateTradingWithdrawResult = v.InferOutput<typeof CreateTradingWithdrawResultSchema>;

export const CreateWalletTradingWithdrawResultSchema = CreateTradingWithdrawResultSchema;
export type CreateWalletTradingWithdrawResult = v.InferOutput<
    typeof CreateWalletTradingWithdrawResultSchema
>;
