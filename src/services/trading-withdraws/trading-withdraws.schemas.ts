import * as v from "valibot";
import { optionalSubaccountIdInputSchema, positiveBigintLikeSchema } from "../../shared/schemas.js";
import { decimalToScaledInt } from "../../utils/numbers.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();
const QuantityScaledSchema = positiveBigintLikeSchema("quantityScaled must be greater than 0");

const AmountInputSchema = v.pipe(
    v.object({
        amount: v.pipe(v.string(), v.trim(), v.minLength(1)),
        quantityScale: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(36)),
    }),
    v.transform(({ amount, quantityScale }) => decimalToScaledInt(amount, quantityScale, "amount")),
    v.check((value) => value > 0n, "amount must be greater than 0"),
);

const QuantityInputSchema = v.union([
    v.object({ quantityScaled: QuantityScaledSchema }),
    v.pipe(
        AmountInputSchema,
        v.transform((quantityScaled) => ({ quantityScaled })),
    ),
]);

export const CreateTradingWithdrawToFundingInputSchema = v.intersect([
    v.object({
        subaccountId: OptionalSubaccountIdSchema,
        assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
        destinationAddress: v.optional(v.pipe(v.string(), v.trim()), ""),
        signerWallet: v.optional(v.pipe(v.string(), v.trim()), ""),
        payloadSignature: v.optional(v.instance(Uint8Array)),
    }),
    QuantityInputSchema,
]);

export type CreateTradingWithdrawToFundingInput = v.InferInput<
    typeof CreateTradingWithdrawToFundingInputSchema
>;

export type CreateTradingWithdrawToFundingRequest = v.InferOutput<
    typeof CreateTradingWithdrawToFundingInputSchema
>;

export const CreateTradingWithdrawResultSchema = v.object({
    intentId: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type CreateTradingWithdrawResult = v.InferOutput<typeof CreateTradingWithdrawResultSchema>;

export const CreateWalletTradingWithdrawResultSchema = CreateTradingWithdrawResultSchema;
export type CreateWalletTradingWithdrawResult = v.InferOutput<
    typeof CreateWalletTradingWithdrawResultSchema
>;
