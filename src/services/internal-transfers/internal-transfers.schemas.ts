import type { MessageInitShape } from "@bufbuild/protobuf";
import * as v from "valibot";
import type * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import { idInputSchema } from "../../shared/schemas.js";
import { tsNsToMs } from "../../utils/time.js";
import {
    E18_SCALE,
    quantityInputToE18,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import { InternalTransferDestinationCodec } from "./internal-transfers.codecs.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { fromU128, toU128 } from "../../utils/u128.js";

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

const IdSchema = idInputSchema;

export const InternalTransferDestinationInputSchema = v.pipe(
    v.variant("type", [
        v.strictObject({
            type: v.literal("account"),
            accountId: IdSchema("accountId"),
        }),
        v.strictObject({
            type: v.literal("subaccount"),
            subaccountId: IdSchema("subaccountId"),
        }),
        v.strictObject({
            type: v.literal("smartAccountAddress"),
            address: v.pipe(v.string(), v.trim(), v.minLength(1)),
        }),
    ]),
    v.transform((destination) => {
        switch (destination.type) {
            case "account":
                return {
                    case: InternalTransferDestinationCodec.inputToProtoCase.account,
                    value: destination.accountId,
                } as const;
            case "subaccount":
                return {
                    case: InternalTransferDestinationCodec.inputToProtoCase.subaccount,
                    value: destination.subaccountId,
                } as const;
            case "smartAccountAddress":
                return {
                    case: InternalTransferDestinationCodec.inputToProtoCase.smartAccountAddress,
                    value: destination.address,
                } as const;
        }
    }),
);

export type InternalTransferDestination = v.InferInput<
    typeof InternalTransferDestinationInputSchema
>;

export function createCreateInternalTransferInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...AccountScopeInputEntries,
            destination: InternalTransferDestinationInputSchema,
            assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
            quantity: v.string(),
            idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
        }),
        v.transform(
            ({ account, quantity, ...input }) =>
                ({
                    ...input,
                    amountE18: toU128(
                        quantityInputToE18({
                            scales,
                            assetId: input.assetId,
                            quantity,
                        }),
                    ),
                    subaccountId: accountScopeToSubaccountId(account),
                }) satisfies MessageInitShape<typeof Proto.CreateInternalTransferRequestSchema>,
        ),
    );
}

export type CreateInternalTransferInput = v.InferInput<
    ReturnType<typeof createCreateInternalTransferInputSchema>
>;
export type CreateInternalTransferRequest = v.InferOutput<
    ReturnType<typeof createCreateInternalTransferInputSchema>
>;

const NonEmptyResponseStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const OptionalResponseStringSchema = v.pipe(
    v.optional(v.pipe(v.string(), v.trim())),
    v.transform((value) => (value ? value : undefined)),
);

export const ResolvedInternalTransferDestinationSchema = v.pipe(
    v.object({
        rootAccountPublicId: OptionalResponseStringSchema,
        subaccountPublicId: OptionalResponseStringSchema,
        smartAccountAddress: OptionalResponseStringSchema,
    }),
    v.transform(({ rootAccountPublicId, subaccountPublicId, smartAccountAddress }) => ({
        rootAccountId: rootAccountPublicId,
        subaccountId: subaccountPublicId,
        smartAccountAddress,
    })),
);

export type ResolvedInternalTransferDestination = v.InferOutput<
    typeof ResolvedInternalTransferDestinationSchema
>;

export function createCreateInternalTransferResultSchema() {
    return v.pipe(
        v.object({
            requestId: NonEmptyResponseStringSchema,
            transferId: NonEmptyResponseStringSchema,
            acceptedAtTsNs: v.bigint(),
            assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
            assetCode: NonEmptyResponseStringSchema,
            uAssetId: NonEmptyResponseStringSchema,
            amountE18: U128Schema,
            destination: v.optional(ResolvedInternalTransferDestinationSchema),
        }),
        v.transform(({ acceptedAtTsNs, amountE18, ...result }) => ({
            ...result,
            acceptedAtUnixMs: tsNsToMs(acceptedAtTsNs),
            quantity: scaledToDecimalOutput(fromU128(amountE18), E18_SCALE),
        })),
    );
}

export type CreateInternalTransferResult = v.InferOutput<
    ReturnType<typeof createCreateInternalTransferResultSchema>
>;
