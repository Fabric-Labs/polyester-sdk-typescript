import * as v from "valibot";
import {
    idInputSchema,
    optionalSubaccountIdInputSchema,
    positiveBigintLikeSchema,
} from "../../shared/schemas.js";
import { tsNsToMs } from "../../utils/time.js";
import { InternalTransferDestinationCodec } from "./internal-transfers.codecs.js";

const OptionalSubaccountIdSchema = optionalSubaccountIdInputSchema();
const IdSchema = idInputSchema;
const QuantityScaledSchema = positiveBigintLikeSchema("quantityScaled must be greater than 0");

export const InternalTransferDestinationInputSchema = v.pipe(
    v.variant("type", [
        v.object({
            type: v.literal("account"),
            accountId: IdSchema("accountId"),
        }),
        v.object({
            type: v.literal("subaccount"),
            subaccountId: IdSchema("subaccountId"),
        }),
        v.object({
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

export const CreateInternalTransferInputSchema = v.object({
    subaccountId: OptionalSubaccountIdSchema,
    destination: InternalTransferDestinationInputSchema,
    assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
    quantityScaled: QuantityScaledSchema,
    idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type CreateInternalTransferInput = v.InferInput<typeof CreateInternalTransferInputSchema>;
export type CreateInternalTransferRequest = v.InferOutput<typeof CreateInternalTransferInputSchema>;

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

export const CreateInternalTransferResultSchema = v.pipe(
    v.object({
        requestId: NonEmptyResponseStringSchema,
        transferId: NonEmptyResponseStringSchema,
        acceptedAtUnixNs: v.bigint(),
        assetId: v.pipe(v.number(), v.integer(), v.gtValue(0)),
        assetCode: NonEmptyResponseStringSchema,
        uAssetId: NonEmptyResponseStringSchema,
        quantityScaled: v.bigint(),
        destination: v.optional(ResolvedInternalTransferDestinationSchema),
    }),
    v.transform(({ acceptedAtUnixNs, quantityScaled, ...result }) => ({
        ...result,
        acceptedAtUnixMs: tsNsToMs(acceptedAtUnixNs),
        quantityScaled: quantityScaled.toString(),
    })),
);

export type CreateInternalTransferResult = v.InferOutput<typeof CreateInternalTransferResultSchema>;
