import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { RateLimitDetailSchema } from "../../shared/rate-limit.schemas.js";
import { OptionalPublicIdSchema } from "../../shared/schemas.js";

export type OrderErrorCode = keyof typeof ProtoWrite.ErrorCode;

/**
 * Names an order error code. A code newer than this build reads as `"UNSPECIFIED"`, so a
 * backend ahead of the SDK degrades the code instead of failing the whole response.
 */
export function orderErrorCodeName(code: number): OrderErrorCode {
    const name: unknown = ProtoWrite.ErrorCode[code];
    return typeof name === "string" ? (name as OrderErrorCode) : "UNSPECIFIED";
}

export const OrderErrorDetailSchema = v.object({
    code: v.pipe(v.number(), v.transform(orderErrorCodeName)),
    violations: v.array(
        v.object({
            fieldPath: v.string(),
            ruleId: v.string(),
            message: v.string(),
        }),
    ),
    rateLimit: v.optional(RateLimitDetailSchema),
    /** Order holding the client order ID on a `CONFLICT_DUPLICATE_CLIENT_ORDER_ID` rejection, when known. */
    existingOrderId: OptionalPublicIdSchema,
});

export type OrderErrorDetail = v.InferOutput<typeof OrderErrorDetailSchema>;
