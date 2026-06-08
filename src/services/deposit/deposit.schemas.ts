import * as v from "valibot";
import { optionalSubaccountIdInputSchema } from "../../shared/schemas.js";
import {
    createCatalogSnapshotReader,
    staticCatalog,
    type CatalogSnapshot,
} from "../../catalogs/index.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();

function chainIdInputSchema(catalog: CatalogSnapshot, required: boolean) {
    const reader = createCatalogSnapshotReader(catalog);
    return v.pipe(
        v.object({
            chainId: v.optional(v.pipe(v.number(), v.integer(), v.gtValue(0))),
            chainCode: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
        }),
        v.transform((input) => {
            const chainId =
                input.chainId ??
                (input.chainCode ? reader.zipper.requireChainIdByCode(input.chainCode) : undefined);
            if (required && chainId === undefined) {
                throw new Error("chainId or chainCode is required");
            }
            return { chainId };
        }),
    );
}

export function createCreateDepositAddressInputSchema(catalog: CatalogSnapshot) {
    return v.intersect([
        v.object({ subaccountId: OptionalSubaccountIdSchema }),
        chainIdInputSchema(catalog, true),
    ]);
}

export const CreateDepositAddressInputSchema = createCreateDepositAddressInputSchema(
    staticCatalog.snapshot(),
);

export type CreateDepositAddressInput = v.InferInput<typeof CreateDepositAddressInputSchema>;
export type CreateDepositAddressRequest = v.InferOutput<typeof CreateDepositAddressInputSchema>;

export function createListDepositAddressesInputSchema(catalog: CatalogSnapshot) {
    return v.intersect([
        v.object({ subaccountId: OptionalSubaccountIdSchema }),
        chainIdInputSchema(catalog, false),
    ]);
}

export const ListDepositAddressesInputSchema = createListDepositAddressesInputSchema(
    staticCatalog.snapshot(),
);

export type ListDepositAddressesInput = v.InferInput<typeof ListDepositAddressesInputSchema>;
export type ListDepositAddressesRequest = v.InferOutput<typeof ListDepositAddressesInputSchema>;

export const DepositAddressSchema = v.object({
    chainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    depositAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type DepositAddress = v.InferOutput<typeof DepositAddressSchema>;

export const DepositAddressesSchema = v.array(DepositAddressSchema);
