import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import { create } from "@bufbuild/protobuf";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { OptionalPublicIdSchema, PublicIdSchema } from "../../shared/schemas.js";
import { positiveDecimalInputToScaled, type SdkScales } from "../../shared/decimal-surface.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { MODIFY_BEHAVIOR_VALUES, ModifyActionCodec, ModifyBehaviorCodec } from "./orders.codecs.js";
import { createRequiredRiskPolicyInputSchema } from "./orders-risk.schemas.js";
import {
    ClientOrderIdInputSchema,
    OrderRequestIdInputSchema,
} from "./orders-identifiers.schemas.js";

const ModifyBehaviorInputSchema = v.picklist(MODIFY_BEHAVIOR_VALUES);

const ModifyOrderIdInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.transform((value) => idToBigInt(value, "orderId")),
    v.check((value) => value > 0n, "orderId must be greater than zero"),
);

const DecimalInputStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const ModifyOrderItemBaseInputSchema = v.object({
    symbolId: v.pipe(v.number(), v.integer(), v.gtValue(0), v.maxValue(PROTOBUF_UINT32_MAX)),
    behavior: v.optional(ModifyBehaviorInputSchema),
    newClientOrderId: v.optional(ClientOrderIdInputSchema),
});

const ModifyOrderRequestInputSchema = v.object({
    ...AccountScopeInputEntries,
    requestId: v.optional(OrderRequestIdInputSchema),
});

const ModifyOrderKeyInputSchema = v.union([
    v.pipe(
        v.object({
            orderId: ModifyOrderIdInputSchema,
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

const ModifyOrderPricePatchInputSchema = v.object({
    newPrice: DecimalInputStringSchema,
    newQty: v.optional(DecimalInputStringSchema),
});

const ModifyOrderQtyPatchInputSchema = v.object({
    newPrice: v.optional(DecimalInputStringSchema),
    newQty: DecimalInputStringSchema,
});

const ModifyOrderNoPriceQtyPatchInputSchema = v.object({
    newPrice: v.optional(v.never()),
    newQty: v.optional(v.never()),
});

const ModifyOrderClearRiskPatchInputSchema = v.object({
    risk: v.optional(v.never()),
    clearRisk: v.literal(true),
});

const ModifyOrderNoRiskPatchInputSchema = v.object({
    risk: v.optional(v.never()),
    clearRisk: v.optional(v.literal(false)),
});

const MODIFY_ORDER_ITEM_INPUT_KEYS = new Set<string>([
    ...Object.keys(ModifyOrderItemBaseInputSchema.entries),
    "orderId",
    "clientOrderId",
    "newPrice",
    "newQty",
    "risk",
    "clearRisk",
]);

const MODIFY_ORDER_INPUT_KEYS = new Set<string>([
    ...MODIFY_ORDER_ITEM_INPUT_KEYS,
    ...Object.keys(ModifyOrderRequestInputSchema.entries),
]);

/**
 * The modify-order input is a v.intersect of partial object schemas, so its
 * members cannot use v.strictObject (each member would reject the other
 * members' keys). Unknown keys are rejected up front instead, matching the
 * strict-input behavior of every other mutating method.
 */
export function assertKnownModifyOrderInputKeys(input: object): void {
    for (const key of Object.keys(input)) {
        if (!MODIFY_ORDER_INPUT_KEYS.has(key)) {
            throw new Error(`Unknown key "${key}" in modify order input.`);
        }
    }
}

function createModifyOrderPatchInputSchema(scales: SdkScales) {
    const ModifyOrderSetRiskPatchInputSchema = v.object({
        risk: createRequiredRiskPolicyInputSchema(scales),
        clearRisk: v.optional(v.literal(false)),
    });

    const ModifyOrderAnyRiskPatchInputSchema = v.union([
        ModifyOrderSetRiskPatchInputSchema,
        ModifyOrderClearRiskPatchInputSchema,
        ModifyOrderNoRiskPatchInputSchema,
    ]);

    const ModifyOrderRequiredRiskPatchInputSchema = v.union([
        ModifyOrderSetRiskPatchInputSchema,
        ModifyOrderClearRiskPatchInputSchema,
    ]);

    return v.union([
        v.intersect([ModifyOrderPricePatchInputSchema, ModifyOrderAnyRiskPatchInputSchema]),
        v.intersect([ModifyOrderQtyPatchInputSchema, ModifyOrderAnyRiskPatchInputSchema]),
        v.intersect([
            ModifyOrderNoPriceQtyPatchInputSchema,
            ModifyOrderRequiredRiskPatchInputSchema,
        ]),
    ]);
}

function createModifyOrderItemObjectInputSchema(scales: SdkScales) {
    return v.intersect([
        ModifyOrderItemBaseInputSchema,
        ModifyOrderKeyInputSchema,
        createModifyOrderPatchInputSchema(scales),
    ]);
}

type ParsedModifyOrderItemInput = v.InferOutput<
    ReturnType<typeof createModifyOrderItemObjectInputSchema>
>;

function toModifyOrderItem(
    input: ParsedModifyOrderItemInput,
    scales: SdkScales,
    defaultBehavior: ProtoWrite.ModifyBehavior,
) {
    return {
        key: input.key,
        newPriceTicks:
            input.newPrice === undefined
                ? undefined
                : positiveDecimalInputToScaled("newPrice", input.newPrice, scales.price()),
        newQtyScaled:
            input.newQty === undefined
                ? undefined
                : positiveDecimalInputToScaled(
                      "newQty",
                      input.newQty,
                      scales.baseQty(input.symbolId),
                  ),
        newAttachedRisk:
            input.clearRisk === true ? create(ProtoWrite.RiskPolicySchema) : input.risk,
        behavior: input.behavior
            ? ModifyBehaviorCodec.inputToProto[input.behavior]
            : defaultBehavior,
        newClientOrderId: input.newClientOrderId ?? "",
        symbolId: input.symbolId,
    };
}

export function createModifyOrderInputSchema(scales: SdkScales) {
    return v.pipe(
        v.intersect([
            ModifyOrderRequestInputSchema,
            createModifyOrderItemObjectInputSchema(scales),
        ]),
        v.transform((input) => ({
            subaccountId: accountScopeToSubaccountId(input.account),
            requestId: input.requestId,
            ...toModifyOrderItem(input, scales, ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE),
        })),
    );
}

export type ModifyOrderInput = v.InferInput<ReturnType<typeof createModifyOrderInputSchema>>;

export const ModifyOrderResultSchema = v.pipe(
    v.object({
        actionTaken: v.pipe(
            v.enum(ProtoWrite.ModifyActionTaken),
            v.transform((v) =>
                requiredEnumLabel(
                    ModifyActionCodec.protoToOutput,
                    v,
                    "ModifyOrderResultSchema",
                    "action taken",
                ),
            ),
        ),
        oldOrderId: PublicIdSchema,
        finalOrderId: PublicIdSchema,
        code: v.string(),
        takeProfitTriggerId: OptionalPublicIdSchema,
        stopLossTriggerId: OptionalPublicIdSchema,
        trailingStopTriggerId: OptionalPublicIdSchema,
        tsNs: v.bigint(),
    }),
    v.transform(({ tsNs, ...result }) => ({
        ...result,
        ts: tsNsToMs(tsNs),
        tsNs: tsNs.toString(),
    })),
);

export type ModifyOrderResult = v.InferOutput<typeof ModifyOrderResultSchema>;
