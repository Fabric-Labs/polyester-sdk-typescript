import type { MessageInitShape } from "@bufbuild/protobuf";
import { PositiveUint32InputSchema } from "../shared.js";
import * as v from "valibot";
import type * as Proto from "../../gen/transfer/v1/internal_transfer_pb.js";
import { idInputSchema, U128Schema } from "../../shared/schemas.js";
import { tsNsToMs } from "../../utils/time.js";
import {
    E18_SCALE,
    quantityInputToE18,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import {
    InternalTransferBatchLegStatusCodec,
    InternalTransferBatchStatusCodec,
    InternalTransferDestinationCodec,
    InternalTransferStatusCodec,
    internalTransferErrorCodeName,
} from "./internal-transfers.codecs.js";
import { enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
    accountScopeToSubaccountIdOrZero,
} from "../../shared/account-scope.js";
import { fromU128, toU128 } from "../../utils/u128.js";

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
            assetId: PositiveUint32InputSchema,
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
            assetId: v.number(),
            assetCode: NonEmptyResponseStringSchema,
            uAssetId: NonEmptyResponseStringSchema,
            amountE18: U128Schema,
            destination: v.optional(ResolvedInternalTransferDestinationSchema),
            status: enumLabelSchema(InternalTransferStatusCodec.protoToOutput),
            /** Lifecycle flow ID for `lifecycle.getAccountFlow`; empty when the server did not return one. */
            flowId: v.optional(v.pipe(v.string(), v.trim()), ""),
        }),
        v.transform(({ acceptedAtTsNs, amountE18, ...result }) => ({
            ...result,
            acceptedAtUnixMs: tsNsToMs(acceptedAtTsNs),
            /** Exact acceptance time in nanoseconds since epoch, as a decimal string. */
            acceptedAtNs: acceptedAtTsNs.toString(),
            quantity: scaledToDecimalOutput(fromU128(amountE18), E18_SCALE),
        })),
    );
}

export type CreateInternalTransferResult = v.InferOutput<
    ReturnType<typeof createCreateInternalTransferResultSchema>
>;

/** The most legs one batch may carry. */
export const MAX_INTERNAL_TRANSFER_BATCH_LEGS = 500;

export function createBatchCreateInternalTransfersInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            /**
             * Up to 500 transfers, moved together, in order. Each leg debits its own `account`
             * (the resolved active account when omitted). A batch debits at most 10 distinct
             * source accounts and 50 distinct source account and asset pairs, and a source,
             * destination and asset combination appears at most once; legs may otherwise repeat
             * an asset, a source or a destination.
             */
            legs: v.pipe(
                v.array(
                    v.strictObject({
                        ...AccountScopeInputEntries,
                        destination: InternalTransferDestinationInputSchema,
                        assetId: PositiveUint32InputSchema,
                        quantity: v.string(),
                    }),
                ),
                v.minLength(1, "A batch needs at least one leg."),
                v.maxLength(
                    MAX_INTERNAL_TRANSFER_BATCH_LEGS,
                    `A batch holds at most ${MAX_INTERNAL_TRANSFER_BATCH_LEGS} legs.`,
                ),
            ),
            /** Covers the whole batch; a retry must send the same legs in the same order. */
            idempotencyKey: v.pipe(v.string(), v.trim(), v.minLength(1)),
        }),
        v.transform(
            ({ legs, idempotencyKey }) =>
                ({
                    idempotencyKey,
                    legs: legs.map(({ account, quantity, ...leg }) => ({
                        ...leg,
                        subaccountId: accountScopeToSubaccountIdOrZero(account),
                        amountE18: toU128(
                            quantityInputToE18({ scales, assetId: leg.assetId, quantity }),
                        ),
                    })),
                }) satisfies MessageInitShape<
                    typeof Proto.BatchCreateInternalTransfersRequestSchema
                >,
        ),
    );
}

export type BatchCreateInternalTransfersInput = v.InferInput<
    ReturnType<typeof createBatchCreateInternalTransfersInputSchema>
>;
export type InternalTransferBatchLegInput = BatchCreateInternalTransfersInput["legs"][number];

const InternalTransferBatchLegResultSchema = v.pipe(
    v.object({
        legIndex: v.number(),
        status: enumLabelSchema(InternalTransferBatchLegStatusCodec.protoToOutput),
        /** Set once the batch is accepted for processing. */
        transferId: OptionalResponseStringSchema,
        /** Lifecycle flow ID for `lifecycle.getAccountFlow`; set once the leg is credited. */
        flowId: OptionalResponseStringSchema,
        creditedAtTsNs: v.optional(v.bigint(), 0n),
        assetId: v.number(),
        assetCode: OptionalResponseStringSchema,
        amountE18: v.optional(U128Schema),
        destination: v.optional(ResolvedInternalTransferDestinationSchema),
        errorCode: v.optional(v.number(), 0),
        errorMessage: OptionalResponseStringSchema,
    }),
    v.transform(({ creditedAtTsNs, amountE18, errorCode, ...leg }) => ({
        ...leg,
        /** When the leg was credited; unset before. */
        creditedAtUnixMs: creditedAtTsNs ? tsNsToMs(creditedAtTsNs) : undefined,
        /** Exact credit time in nanoseconds since epoch, as a decimal string; unset before. */
        creditedAtNs: creditedAtTsNs ? creditedAtTsNs.toString() : undefined,
        quantity: amountE18 ? scaledToDecimalOutput(fromU128(amountE18), E18_SCALE) : undefined,
        /** Why the leg caused its batch's refusal; unset for every other leg. */
        errorCode: errorCode ? internalTransferErrorCodeName(errorCode) : undefined,
    })),
);

export type InternalTransferBatchLegResult = v.InferOutput<
    typeof InternalTransferBatchLegResultSchema
>;

export const BatchCreateInternalTransfersResultSchema = v.object({
    /**
     * Batch request ID for `internalTransfers.getBatch`; unset when the batch was refused before
     * it was accepted for processing.
     */
    requestId: OptionalResponseStringSchema,
    status: enumLabelSchema(InternalTransferBatchStatusCodec.protoToOutput),
    /** One result per leg, in request order. */
    legs: v.optional(v.array(InternalTransferBatchLegResultSchema), []),
});

export type BatchCreateInternalTransfersResult = v.InferOutput<
    typeof BatchCreateInternalTransfersResultSchema
>;

const TransferLookupIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

export const GetInternalTransferBatchInputSchema = v.strictObject({
    /** Batch `requestId` returned by `internalTransfers.batchCreate`. */
    requestId: TransferLookupIdSchema,
});

export type GetInternalTransferBatchInput = v.InferInput<
    typeof GetInternalTransferBatchInputSchema
>;

export const GetInternalTransferInputSchema = v.pipe(
    v.union(
        [
            v.strictObject({ ...AccountScopeInputEntries, requestId: TransferLookupIdSchema }),
            v.strictObject({ ...AccountScopeInputEntries, transferId: TransferLookupIdSchema }),
        ],
        "Pass exactly one of requestId or transferId.",
    ),
    v.transform(
        ({ account, ...selector }) =>
            ({
                subaccountId: accountScopeToSubaccountId(account),
                identifier:
                    "requestId" in selector
                        ? { case: "requestId", value: selector.requestId }
                        : { case: "transferId", value: selector.transferId },
            }) satisfies MessageInitShape<typeof Proto.GetInternalTransferRequestSchema>,
    ),
);

/** Selects an accepted transfer by exactly one of its `requestId` or `transferId`. */
export type GetInternalTransferInput = v.InferInput<typeof GetInternalTransferInputSchema>;

export const GetInternalTransferResultSchema = v.pipe(
    v.object({
        requestId: NonEmptyResponseStringSchema,
        transferId: NonEmptyResponseStringSchema,
        flowId: NonEmptyResponseStringSchema,
        acceptedAtTsNs: v.bigint(),
    }),
    v.transform(({ acceptedAtTsNs, ...result }) => ({
        ...result,
        acceptedAtUnixMs: tsNsToMs(acceptedAtTsNs),
        /** Exact acceptance time in nanoseconds since epoch, as a decimal string. */
        acceptedAtNs: acceptedAtTsNs.toString(),
    })),
);

export type GetInternalTransferResult = v.InferOutput<typeof GetInternalTransferResultSchema>;
