import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as ProtoRead from "../../gen/orders/v1/orders_read_pb.js";
import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { OptionalPublicIdSchema, PublicIdSchema, idInputSchema } from "../../shared/schemas.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { tsNsToMs } from "../../utils/time.js";
import { formatId } from "../../utils/base58-id.js";
import { SideSchema } from "../shared.js";
import {
    positiveDecimalInputToScaled,
    scaledToDecimalOutput,
    type SdkScales,
} from "../../shared/decimal-surface.js";
import {
    BatchReplaceAdmissionStatusCodec,
    BatchReplaceItemAdmissionStatusCodec,
    BatchReplacePhaseCodec,
    OrderStatusCodec,
    OrderSideCodec,
} from "./orders.codecs.js";
import { createOrderIntentInputSchema } from "./orders-input.schemas.js";
import { createRequiredRiskPolicyInputSchema } from "./orders-risk.schemas.js";
import {
    ClientOrderIdInputSchema,
    OrderRequestIdInputSchema,
} from "./orders-identifiers.schemas.js";
import { OrderErrorDetailSchema } from "./order-errors.schemas.js";

const BatchCountSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const BatchItemIndexSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const PositivePublicIdSchema = v.pipe(
    v.bigint(),
    v.gtValue(0n),
    v.transform((value) => formatId(value)),
);
const OptionalSymbolInputSchema = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32)));
const OptionalSideInputSchema = v.pipe(
    v.optional(SideSchema),
    v.transform((side) => (side ? OrderSideCodec.inputToProto[side] : undefined)),
);

const CancelAllAfterTimeoutInputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.check(
        (timeoutSec) => timeoutSec === 0 || (timeoutSec >= 10 && timeoutSec <= 120),
        "timeoutSec must be 0 to disable or between 10 and 120 seconds to arm",
    ),
);

export const CancelAllAfterInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        timeoutSec: CancelAllAfterTimeoutInputSchema,
        symbol: OptionalSymbolInputSchema,
        side: OptionalSideInputSchema,
        requestId: v.optional(OrderRequestIdInputSchema),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type CancelAllAfterInput = v.InferInput<typeof CancelAllAfterInputSchema>;

export const CancelAllAfterResultSchema = v.pipe(
    v.object({
        status: v.picklist(["armed", "disabled"]),
        effectiveTimeoutSec: v.pipe(v.number(), v.integer(), v.minValue(0)),
        expiresAtTsNs: v.bigint(),
        tsNs: v.bigint(),
    }),
    v.transform(({ expiresAtTsNs, tsNs, ...result }) => ({
        ...result,
        expiresAt: tsNsToMs(expiresAtTsNs),
        expiresAtNs: expiresAtTsNs.toString(),
        ts: tsNsToMs(tsNs),
        tsNs: tsNs.toString(),
    })),
);

export type CancelAllAfterResult = v.InferOutput<typeof CancelAllAfterResultSchema>;

export function createBatchCreateOrdersInputSchema(scales: SdkScales) {
    return v.pipe(
        v.strictObject({
            ...AccountScopeInputEntries,
            requestId: v.optional(OrderRequestIdInputSchema),
            items: v.pipe(
                v.array(createOrderIntentInputSchema(scales)),
                v.minLength(1, "At least one order is required."),
                v.maxLength(20, "Batch create accepts at most 20 orders."),
            ),
        }),
        v.transform(({ account, ...input }) => ({
            ...input,
            subaccountId: accountScopeToSubaccountId(account),
        })),
    );
}

export type BatchCreateOrdersInput = v.InferInput<
    ReturnType<typeof createBatchCreateOrdersInputSchema>
>;

const BatchCreateOrderResultRawSchema = v.object({
    clientOrderId: v.string(),
    outcome: v.variant("case", [
        v.object({
            case: v.literal("accepted"),
            value: v.object({
                orderId: PublicIdSchema,
                takeProfitTriggerId: OptionalPublicIdSchema,
                stopLossTriggerId: OptionalPublicIdSchema,
                trailingStopTriggerId: OptionalPublicIdSchema,
                resolvedBaseQtyScaled: v.bigint(),
                submittedMaxQuoteDebitScaled: v.optional(v.bigint()),
            }),
        }),
        v.object({
            case: v.literal("rejected"),
            value: v.object({
                error: OrderErrorDetailSchema,
            }),
        }),
    ]),
});

export function createBatchCreateOrdersResultSchema(scales: SdkScales, symbols: string[]) {
    return v.pipe(
        v.object({
            results: v.array(BatchCreateOrderResultRawSchema),
            acceptedCount: BatchCountSchema,
            rejectedCount: BatchCountSchema,
            tsNs: v.bigint(),
        }),
        v.check(
            (response) =>
                response.acceptedCount + response.rejectedCount === response.results.length,
            "Batch create result counts do not match the returned results.",
        ),
        v.check(
            (response) => response.results.length === symbols.length,
            "Batch create result count does not match the submitted item count.",
        ),
        v.transform(({ tsNs, ...response }) => ({
            ...response,
            results: response.results.map(({ clientOrderId, outcome }, index) => {
                if (outcome.case === "rejected") {
                    return {
                        status: "rejected" as const,
                        clientOrderId,
                        error: outcome.value.error,
                    };
                }
                const { resolvedBaseQtyScaled, submittedMaxQuoteDebitScaled, ...accepted } =
                    outcome.value;
                const symbol = symbols[index]!;
                return {
                    status: "accepted" as const,
                    clientOrderId,
                    ...accepted,
                    resolvedBaseQty: scaledToDecimalOutput(
                        resolvedBaseQtyScaled,
                        scales.baseQty(symbol),
                    ),
                    ...(submittedMaxQuoteDebitScaled === undefined
                        ? {}
                        : {
                              submittedMaxQuoteDebit: scaledToDecimalOutput(
                                  submittedMaxQuoteDebitScaled,
                                  scales.quoteAmount(symbol),
                              ),
                          }),
                };
            }),
            ts: tsNsToMs(tsNs),
            tsNs: tsNs.toString(),
        })),
    );
}

export type BatchCreateOrdersResult = v.InferOutput<
    ReturnType<typeof createBatchCreateOrdersResultSchema>
>;
export type BatchCreateOrderResult = BatchCreateOrdersResult["results"][number];

const DecimalInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const BATCH_REPLACE_ITEM_INPUT_KEYS = new Set([
    "orderId",
    "clientOrderId",
    "newPrice",
    "newQty",
    "risk",
    "clearRisk",
    "newClientOrderId",
]);

export function assertKnownBatchReplaceOrderItemInputKeys(input: object): void {
    for (const key of Object.keys(input)) {
        if (!BATCH_REPLACE_ITEM_INPUT_KEYS.has(key)) {
            throw new Error(`Unknown key "${key}" in batch replace order item.`);
        }
    }
}

const BatchReplaceTargetInputSchema = v.union([
    v.pipe(
        v.object({
            orderId: v.pipe(
                idInputSchema("items.orderId"),
                v.check((value) => value > 0n, "items.orderId must be greater than zero"),
            ),
            clientOrderId: v.optional(v.never()),
        }),
        v.transform(({ orderId }) => ({
            key: { case: "orderId" as const, value: orderId },
        })),
    ),
    v.pipe(
        v.object({
            orderId: v.optional(v.never()),
            clientOrderId: ClientOrderIdInputSchema,
        }),
        v.transform(({ clientOrderId }) => ({
            key: { case: "clientOrderId" as const, value: clientOrderId },
        })),
    ),
]);

function createBatchReplaceOrderItemInputSchema(scales: SdkScales, symbolId: number) {
    const patchSchema = v.union([
        v.object({
            newPrice: DecimalInputStringSchema,
            newQty: v.optional(DecimalInputStringSchema),
            risk: v.optional(createRequiredRiskPolicyInputSchema(scales)),
            clearRisk: v.optional(v.literal(false)),
        }),
        v.object({
            newPrice: v.optional(DecimalInputStringSchema),
            newQty: DecimalInputStringSchema,
            risk: v.optional(createRequiredRiskPolicyInputSchema(scales)),
            clearRisk: v.optional(v.literal(false)),
        }),
        v.object({
            newPrice: v.optional(v.never()),
            newQty: v.optional(v.never()),
            risk: createRequiredRiskPolicyInputSchema(scales),
            clearRisk: v.optional(v.literal(false)),
        }),
        v.object({
            newPrice: v.optional(v.never()),
            newQty: v.optional(v.never()),
            risk: v.optional(v.never()),
            clearRisk: v.literal(true),
        }),
    ]);
    return v.pipe(
        v.intersect([
            BatchReplaceTargetInputSchema,
            patchSchema,
            v.object({
                newClientOrderId: v.optional(ClientOrderIdInputSchema),
            }),
        ]),
        v.transform((input) => ({
            key: input.key,
            newPriceTicks:
                input.newPrice === undefined
                    ? undefined
                    : positiveDecimalInputToScaled(
                          "items.newPrice",
                          input.newPrice,
                          scales.price(),
                      ),
            newQtyScaled:
                input.newQty === undefined
                    ? undefined
                    : positiveDecimalInputToScaled(
                          "items.newQty",
                          input.newQty,
                          scales.baseQty(symbolId),
                      ),
            newAttachedRisk:
                input.clearRisk === true ? create(ProtoWrite.RiskPolicySchema) : input.risk,
            newClientOrderId: input.newClientOrderId ?? "",
        })),
    );
}

export function createBatchReplaceOrdersInputSchema(scales: SdkScales, symbolId: number) {
    return v.pipe(
        v.strictObject({
            ...AccountScopeInputEntries,
            symbolId: v.pipe(v.literal(symbolId), v.integer(), v.minValue(1)),
            requestId: v.optional(OrderRequestIdInputSchema),
            items: v.pipe(
                v.array(createBatchReplaceOrderItemInputSchema(scales, symbolId)),
                v.minLength(1, "At least one replacement is required."),
                v.maxLength(50, "Batch replace accepts at most 50 replacements."),
            ),
        }),
        v.check((input) => {
            const targets = input.items.map(
                (item) => `${item.key.case}:${item.key.value.toString()}`,
            );
            return new Set(targets).size === targets.length;
        }, "Each batch replace target must be unique."),
        v.transform(({ account, ...input }) => ({
            ...input,
            subaccountId: accountScopeToSubaccountId(account),
        })),
    );
}

export type BatchReplaceOrdersInput = {
    account?: v.InferInput<typeof AccountScopeInputEntries.account>;
    symbolId: number;
    requestId?: string;
    items: Array<{
        orderId?: string;
        clientOrderId?: string;
        newPrice?: string;
        newQty?: string;
        risk?: v.InferInput<ReturnType<typeof createRequiredRiskPolicyInputSchema>>;
        clearRisk?: boolean;
        newClientOrderId?: string;
    }>;
};

const BatchReplaceAdmissionItemSchema = v.pipe(
    v.object({
        itemIndex: BatchItemIndexSchema,
        status: v.pipe(
            v.enum(ProtoWrite.BatchReplaceItemAdmissionStatus),
            v.transform((status) =>
                requiredEnumLabel(
                    BatchReplaceItemAdmissionStatusCodec.protoToOutput,
                    status,
                    "BatchReplaceAdmissionItemSchema",
                    "status",
                ),
            ),
        ),
        oldOrderId: OptionalPublicIdSchema,
        replacementOrderId: OptionalPublicIdSchema,
        clientOrderId: v.string(),
        code: v.string(),
    }),
    v.transform((item) => ({
        ...item,
        code: item.code || undefined,
    })),
);

export type BatchReplaceAdmissionItem = v.InferOutput<typeof BatchReplaceAdmissionItemSchema>;

export const BatchReplaceOrdersResultSchema = v.pipe(
    v.object({
        batchRequestId: PositivePublicIdSchema,
        status: v.pipe(
            v.enum(ProtoWrite.BatchReplaceAdmissionStatus),
            v.transform((status) =>
                requiredEnumLabel(
                    BatchReplaceAdmissionStatusCodec.protoToOutput,
                    status,
                    "BatchReplaceOrdersResultSchema",
                    "status",
                ),
            ),
        ),
        results: v.array(BatchReplaceAdmissionItemSchema),
        acceptedCount: BatchCountSchema,
        rejectedCount: BatchCountSchema,
        acceptedTsNs: v.bigint(),
    }),
    v.check(
        (response) => response.acceptedCount + response.rejectedCount === response.results.length,
        "Batch replace result counts do not match the returned results.",
    ),
    v.check(
        (response) => response.results.every((item, index) => item.itemIndex === index),
        "Batch replace results must preserve request item order.",
    ),
    v.transform(({ acceptedTsNs, ...response }) => ({
        ...response,
        acceptedTs: tsNsToMs(acceptedTsNs),
        acceptedTsNs: acceptedTsNs.toString(),
    })),
);

export type BatchReplaceOrdersResult = v.InferOutput<typeof BatchReplaceOrdersResultSchema>;

export const GetBatchReplaceStatusInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        batchRequestId: v.pipe(
            idInputSchema("batchRequestId"),
            v.check((value) => value > 0n, "batchRequestId must be greater than zero"),
        ),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type GetBatchReplaceStatusInput = v.InferInput<typeof GetBatchReplaceStatusInputSchema>;

const BatchReplaceStatusItemSchema = v.pipe(
    v.object({
        itemIndex: BatchItemIndexSchema,
        phase: v.pipe(
            v.enum(ProtoRead.BatchReplacePhase),
            v.transform((phase) =>
                requiredEnumLabel(
                    BatchReplacePhaseCodec.protoToOutput,
                    phase,
                    "BatchReplaceStatusItemSchema",
                    "phase",
                ),
            ),
        ),
        oldOrderId: OptionalPublicIdSchema,
        replacementOrderId: OptionalPublicIdSchema,
        orderStatus: v.pipe(
            v.enum(ProtoRead.OrderStatus),
            v.transform((status) =>
                requiredEnumLabel(
                    OrderStatusCodec.protoToOutput,
                    status,
                    "BatchReplaceStatusItemSchema",
                    "order status",
                ),
            ),
        ),
        code: v.string(),
        updatedTsNs: v.bigint(),
    }),
    v.transform(({ updatedTsNs, ...item }) => ({
        ...item,
        code: item.code || undefined,
        updatedTs: tsNsToMs(updatedTsNs),
        updatedTsNs: updatedTsNs.toString(),
    })),
);

export const GetBatchReplaceStatusResultSchema = v.pipe(
    v.object({
        batchRequestId: PositivePublicIdSchema,
        admissionStatus: v.pipe(
            v.enum(ProtoWrite.BatchReplaceAdmissionStatus),
            v.transform((status) =>
                requiredEnumLabel(
                    BatchReplaceAdmissionStatusCodec.protoToOutput,
                    status,
                    "GetBatchReplaceStatusResultSchema",
                    "admission status",
                ),
            ),
        ),
        items: v.array(BatchReplaceStatusItemSchema),
        acceptedCount: BatchCountSchema,
        rejectedCount: BatchCountSchema,
        acceptedTsNs: v.bigint(),
        updatedTsNs: v.bigint(),
    }),
    v.check(
        (response) => response.acceptedCount + response.rejectedCount === response.items.length,
        "Batch replace status counts do not match the returned items.",
    ),
    v.check(
        (response) => response.items.every((item, index) => item.itemIndex === index),
        "Batch replace status items must preserve request item order.",
    ),
    v.transform(({ acceptedTsNs, updatedTsNs, ...response }) => ({
        ...response,
        acceptedTs: tsNsToMs(acceptedTsNs),
        acceptedTsNs: acceptedTsNs.toString(),
        updatedTs: tsNsToMs(updatedTsNs),
        updatedTsNs: updatedTsNs.toString(),
    })),
);

export type GetBatchReplaceStatusResult = v.InferOutput<typeof GetBatchReplaceStatusResultSchema>;

const BatchCancelOrderInputSchema = v.union([
    v.pipe(
        v.strictObject({
            orderId: v.pipe(
                idInputSchema("items.orderId"),
                v.check((value) => value > 0n, "items.orderId must be greater than zero"),
            ),
            clientOrderId: v.optional(v.never()),
            symbolId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        }),
        v.transform(({ orderId, symbolId }) => ({ orderId, symbolId })),
    ),
    v.pipe(
        v.strictObject({
            orderId: v.optional(v.never()),
            clientOrderId: ClientOrderIdInputSchema,
            symbolId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        }),
        v.transform(({ clientOrderId, symbolId }) => ({ clientOrderId, symbolId })),
    ),
]);

export type BatchCancelOrderInput = v.InferInput<typeof BatchCancelOrderInputSchema>;

export const BatchCancelOrdersInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        requestId: v.optional(OrderRequestIdInputSchema),
        items: v.pipe(
            v.array(BatchCancelOrderInputSchema),
            v.minLength(1, "At least one order is required."),
            v.maxLength(50, "Batch cancel accepts at most 50 orders."),
        ),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type BatchCancelOrdersInput = v.InferInput<typeof BatchCancelOrdersInputSchema>;

const BatchCancelOrderResultSchema = v.object({
    status: v.picklist(["accepted", "rejected"]),
    orderId: OptionalPublicIdSchema,
    clientOrderId: v.string(),
    code: v.string(),
});

export type BatchCancelOrderResult = v.InferOutput<typeof BatchCancelOrderResultSchema>;

export const BatchCancelOrdersResultSchema = v.pipe(
    v.object({
        results: v.array(BatchCancelOrderResultSchema),
        acceptedCount: BatchCountSchema,
        rejectedCount: BatchCountSchema,
        tsNs: v.bigint(),
    }),
    v.check(
        (response) => response.acceptedCount + response.rejectedCount === response.results.length,
        "Batch cancel result counts do not match the returned results.",
    ),
    v.transform(({ tsNs, ...response }) => ({
        ...response,
        ts: tsNsToMs(tsNs),
        tsNs: tsNs.toString(),
    })),
);

export type BatchCancelOrdersResult = v.InferOutput<typeof BatchCancelOrdersResultSchema>;
