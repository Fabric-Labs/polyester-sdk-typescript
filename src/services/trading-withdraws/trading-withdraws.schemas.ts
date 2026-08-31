import * as v from "valibot";
import { PositiveUint32InputSchema } from "../shared.js";
import { quantityInputToE18, type SdkScales } from "../../shared/decimal-surface.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import type * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { WithdrawDestinationValidationCode } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { toU128, type U128Value } from "../../utils/u128.js";
import {
    TradingWithdrawActionCodec,
    WithdrawDestinationValidationCodeCodec,
} from "./trading-withdraws.codecs.js";

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
            assetId: PositiveUint32InputSchema,
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
            assetId: PositiveUint32InputSchema,
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

export const ValidateWithdrawDestinationInputSchema = v.pipe(
    v.strictObject({
        destinationChainId: v.pipe(
            v.number(),
            v.integer(),
            v.gtValue(0),
            v.maxValue(Number.MAX_SAFE_INTEGER),
        ),
        destinationAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
    }),
    v.transform((input) => ({
        destinationChainId: BigInt(input.destinationChainId),
        destinationAddress: input.destinationAddress,
    })),
);

export type ValidateWithdrawDestinationInput = v.InferInput<
    typeof ValidateWithdrawDestinationInputSchema
>;
export type ValidateWithdrawDestinationRequest = v.InferOutput<
    typeof ValidateWithdrawDestinationInputSchema
>;

const ValidWithdrawDestinationResultSchema = v.pipe(
    v.object({
        valid: v.literal(true),
        code: v.literal(WithdrawDestinationValidationCode.VALID),
        message: v.string(),
        canonicalDestinationAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
    }),
    v.transform((result) => ({
        ...result,
        code: WithdrawDestinationValidationCodeCodec.protoToOutput[result.code],
    })),
);

const {
    [WithdrawDestinationValidationCode.VALID]: _validWithdrawDestinationCode,
    ...InvalidWithdrawDestinationCodeCodec
} = WithdrawDestinationValidationCodeCodec.protoToOutput;

const InvalidWithdrawDestinationResultSchema = v.pipe(
    v.object({
        valid: v.literal(false),
        code: v.picklist([
            WithdrawDestinationValidationCode.RESULT_UNSPECIFIED,
            WithdrawDestinationValidationCode.INVALID_ADDRESS,
            WithdrawDestinationValidationCode.UNSUPPORTED_CHAIN,
            WithdrawDestinationValidationCode.POLYESTER_SMART_ACCOUNT,
            WithdrawDestinationValidationCode.TOKEN_CONTRACT,
            WithdrawDestinationValidationCode.DENYLISTED_ADDRESS,
        ]),
        message: v.string(),
        canonicalDestinationAddress: v.string(),
    }),
    v.transform((result) => ({
        ...result,
        code: InvalidWithdrawDestinationCodeCodec[result.code],
    })),
);

export const ValidateWithdrawDestinationResultSchema = v.union([
    ValidWithdrawDestinationResultSchema,
    InvalidWithdrawDestinationResultSchema,
]);

export type ValidateWithdrawDestinationResult = v.InferOutput<
    typeof ValidateWithdrawDestinationResultSchema
>;
