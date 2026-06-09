import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { tsNsToMs } from "../../utils/time.js";
import { idToBigInt } from "../../utils/base58-id.js";
import {
    OptionalPublicIdSchema,
    PublicIdSchema,
    positiveBigintStringInputSchema,
} from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { MODIFY_BEHAVIOR_VALUES, ModifyActionCodec, ModifyBehaviorCodec } from "./orders.codecs.js";
import { RequiredRiskPolicyInputSchema } from "./orders-risk.schemas.js";

const ClientOrderIdPattern = /^[A-Za-z0-9._:/-]+$/;
const ModifyBehaviorInputSchema = v.picklist(MODIFY_BEHAVIOR_VALUES);

const ModifyOrderIdInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.transform((value) => idToBigInt(value, "orderId")),
);

const ClientOrderIdInputSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(36),
    v.regex(ClientOrderIdPattern),
);

const ModifyOrderBaseInputSchema = v.object({
    ...AccountScopeInputEntries,
    requestId: v.optional(
        v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.maxLength(64),
            v.regex(ClientOrderIdPattern, "requestId has an invalid format"),
        ),
    ),
    behavior: v.optional(ModifyBehaviorInputSchema),
    newClientOrderId: v.optional(ClientOrderIdInputSchema),
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
    newPriceTicks: positiveBigintStringInputSchema("newPriceTicks"),
    newQtyScaled: v.optional(positiveBigintStringInputSchema("newQtyScaled")),
});

const ModifyOrderQtyPatchInputSchema = v.object({
    newPriceTicks: v.optional(positiveBigintStringInputSchema("newPriceTicks")),
    newQtyScaled: positiveBigintStringInputSchema("newQtyScaled"),
});

const ModifyOrderNoPriceQtyPatchInputSchema = v.object({
    newPriceTicks: v.optional(v.never()),
    newQtyScaled: v.optional(v.never()),
});

const ModifyOrderSetRiskPatchInputSchema = v.object({
    risk: RequiredRiskPolicyInputSchema,
    clearRisk: v.optional(v.literal(false)),
});

const ModifyOrderClearRiskPatchInputSchema = v.object({
    risk: v.optional(v.never()),
    clearRisk: v.literal(true),
});

const ModifyOrderNoRiskPatchInputSchema = v.object({
    risk: v.optional(v.never()),
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

const ModifyOrderPatchInputSchema = v.union([
    v.intersect([ModifyOrderPricePatchInputSchema, ModifyOrderAnyRiskPatchInputSchema]),
    v.intersect([ModifyOrderQtyPatchInputSchema, ModifyOrderAnyRiskPatchInputSchema]),
    v.intersect([ModifyOrderNoPriceQtyPatchInputSchema, ModifyOrderRequiredRiskPatchInputSchema]),
]);

export const ModifyOrderInputSchema = v.pipe(
    v.intersect([
        ModifyOrderBaseInputSchema,
        ModifyOrderKeyInputSchema,
        ModifyOrderPatchInputSchema,
    ]),
    v.transform((input) => {
        const behavior = input.behavior
            ? ModifyBehaviorCodec.inputToProto[input.behavior]
            : ProtoWrite.ModifyBehavior.AMEND_OR_REPLACE;
        const newAttachedRisk =
            input.clearRisk === true
                ? ({} as NonNullable<ProtoWrite.ModifyOrderRequest["newAttachedRisk"]>)
                : input.risk;

        return {
            subaccountId: accountScopeToSubaccountId(input.account),
            key: input.key,
            requestId: input.requestId,
            newPriceTicks: input.newPriceTicks,
            newQtyScaled: input.newQtyScaled,
            newAttachedRisk,
            behavior,
            newClientOrderId: input.newClientOrderId ?? "",
        };
    }),
);

export function createModifyOrderInputSchema() {
    return ModifyOrderInputSchema;
}

export type ModifyOrderInput = v.InferInput<typeof ModifyOrderInputSchema>;

export const ModifyOrderResultSchema = v.object({
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
    tsNs: v.pipe(
        v.bigint(),
        v.transform((v) => tsNsToMs(v)),
    ),
});

export type ModifyOrderResult = v.InferOutput<typeof ModifyOrderResultSchema>;
