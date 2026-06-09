import * as v from "valibot";
import { positiveBigintStringInputSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

const QuantityScaledSchema = positiveBigintStringInputSchema("quantityScaled");

export const CreateTradingWithdrawToFundingInputSchema = v.pipe(
    v.object({
        ...AccountScopeInputEntries,
        assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        quantityScaled: QuantityScaledSchema,
        idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
        destinationAddress: v.optional(v.pipe(v.string(), v.trim()), ""),
        signerWallet: v.optional(v.pipe(v.string(), v.trim()), ""),
        payloadSignature: v.optional(v.instance(Uint8Array)),
    }),
    v.transform((input) => ({
        subaccountId: accountScopeToSubaccountId(input.account),
        assetId: input.assetId,
        idempotencyKey: input.idempotencyKey,
        destinationAddress: input.destinationAddress,
        signerWallet: input.signerWallet,
        payloadSignature: input.payloadSignature,
        quantityScaled: input.quantityScaled,
    })),
);

export function createCreateTradingWithdrawToFundingInputSchema() {
    return CreateTradingWithdrawToFundingInputSchema;
}

export type CreateTradingWithdrawToFundingInput = v.InferInput<
    ReturnType<typeof createCreateTradingWithdrawToFundingInputSchema>
>;

export type CreateTradingWithdrawToFundingRequest = v.InferOutput<
    ReturnType<typeof createCreateTradingWithdrawToFundingInputSchema>
>;

export const CreateTradingWithdrawResultSchema = v.object({
    intentId: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type CreateTradingWithdrawResult = v.InferOutput<typeof CreateTradingWithdrawResultSchema>;

export const CreateWalletTradingWithdrawResultSchema = CreateTradingWithdrawResultSchema;
export type CreateWalletTradingWithdrawResult = v.InferOutput<
    typeof CreateWalletTradingWithdrawResultSchema
>;
