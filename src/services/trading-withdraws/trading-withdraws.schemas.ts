import * as v from "valibot";
import { positiveBigintLikeSchema } from "../../shared/schemas.js";
import { decimalToScaledInt } from "../../utils/numbers.js";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";

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
    return createCreateTradingWithdrawToFundingInputSchemaForReader(
        createCatalogSnapshotReader(catalog),
    );
}

function createCreateTradingWithdrawToFundingInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.intersect([
            v.object({
                ...AccountScopeInputEntries,
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
                subaccountId: accountScopeToSubaccountId(input.account),
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

export function createTradingWithdrawsSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        createTradingWithdrawToFundingInput:
            createCreateTradingWithdrawToFundingInputSchemaForReader(reader),
    }));
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
