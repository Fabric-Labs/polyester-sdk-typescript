import * as v from "valibot";
import { optionalSubaccountIdInputSchema, positiveBigintLikeSchema } from "../../shared/schemas.js";
import { decimalToScaledInt } from "../../utils/numbers.js";
import {
    createCatalogSnapshotReader,
    staticCatalog,
    type CatalogSnapshot,
} from "../../catalogs/index.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();
const QuantityScaledSchema = positiveBigintLikeSchema("quantityScaled must be greater than 0");

const QuantityInputSchema = v.union([
    v.object({
        quantityScaled: QuantityScaledSchema,
        amount: v.optional(v.never()),
        quantityScale: v.optional(v.never()),
    }),
    v.object({
        quantityScaled: v.optional(v.never()),
        amount: v.pipe(v.string(), v.trim(), v.minLength(1)),
        quantityScale: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(36))),
    }),
]);

export function createCreateTradingWithdrawToFundingInputSchema(catalog: CatalogSnapshot) {
    const reader = createCatalogSnapshotReader(catalog);
    return v.pipe(
        v.intersect([
            v.object({
                subaccountId: OptionalSubaccountIdSchema,
                assetId: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0))),
                asset: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
                idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
                destinationAddress: v.optional(v.pipe(v.string(), v.trim()), ""),
                signerWallet: v.optional(v.pipe(v.string(), v.trim()), ""),
                payloadSignature: v.optional(v.instance(Uint8Array)),
            }),
            QuantityInputSchema,
        ]),
        v.transform((input) => {
            const catalogAsset =
                input.assetId !== undefined
                    ? reader.ledger.requireAssetByLedgerId(input.assetId)
                    : input.asset
                      ? reader.ledger.requireAssetBySymbol(input.asset)
                      : undefined;
            if (!catalogAsset) throw new Error("assetId or asset is required");
            const quantityScaled =
                input.quantityScaled ??
                decimalToScaledInt(
                    input.amount,
                    input.quantityScale ?? catalogAsset.quantityScale,
                    "amount",
                );
            if (quantityScaled <= 0n) throw new Error("amount must be greater than 0");
            return {
                subaccountId: input.subaccountId,
                assetId: catalogAsset.ledgerId,
                idempotencyKey: input.idempotencyKey,
                destinationAddress: input.destinationAddress,
                signerWallet: input.signerWallet,
                payloadSignature: input.payloadSignature,
                quantityScaled,
            };
        }),
    );
}

export const CreateTradingWithdrawToFundingInputSchema =
    createCreateTradingWithdrawToFundingInputSchema(staticCatalog.snapshot());

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
