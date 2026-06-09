import * as v from "valibot";
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

function chainIdInputSchemaForReader(reader: CatalogReader, required: boolean) {
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
    return createCreateDepositAddressInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createCreateDepositAddressInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.intersect([
            v.object({ ...AccountScopeInputEntries }),
            chainIdInputSchemaForReader(reader, true),
        ]),
        v.transform(({ account, ...input }) => ({
            ...input,
            subaccountId: accountScopeToSubaccountId(account),
        })),
    );
}

export type CreateDepositAddressInput = v.InferInput<
    ReturnType<typeof createCreateDepositAddressInputSchema>
>;
export type CreateDepositAddressRequest = v.InferOutput<
    ReturnType<typeof createCreateDepositAddressInputSchema>
>;

export function createListDepositAddressesInputSchema(catalog: CatalogSnapshot) {
    return createListDepositAddressesInputSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createListDepositAddressesInputSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.intersect([
            v.object({ ...AccountScopeInputEntries }),
            chainIdInputSchemaForReader(reader, false),
        ]),
        v.transform(({ account, ...input }) => ({
            ...input,
            subaccountId: accountScopeToSubaccountId(account),
        })),
    );
}

export type ListDepositAddressesInput = v.InferInput<
    ReturnType<typeof createListDepositAddressesInputSchema>
>;
export type ListDepositAddressesRequest = v.InferOutput<
    ReturnType<typeof createListDepositAddressesInputSchema>
>;

export function createDepositSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        createDepositAddressInput: createCreateDepositAddressInputSchemaForReader(reader),
        listDepositAddressesInput: createListDepositAddressesInputSchemaForReader(reader),
    }));
}

export const DepositAddressSchema = v.object({
    chainId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    depositAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type DepositAddress = v.InferOutput<typeof DepositAddressSchema>;

export const DepositAddressesSchema = v.array(DepositAddressSchema);
