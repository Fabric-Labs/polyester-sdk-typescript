import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "../../shared/validation.js";
import { RateLimitDetailSchema } from "../../shared/rate-limit.schemas.js";

export type OrderErrorCode = keyof typeof ProtoWrite.ErrorCode;

function orderErrorCodeName(code: ProtoWrite.ErrorCode): OrderErrorCode {
    const name = ProtoWrite.ErrorCode[code];
    if (typeof name !== "string") {
        throw new Error(`[OrderErrorDetailSchema]: invalid order error code ${code}`);
    }
    return name as OrderErrorCode;
}

export const OrderErrorDetailSchema = v.object({
    code: v.pipe(
        v.enum(ProtoWrite.ErrorCode),
        v.transform((code) => orderErrorCodeName(code)),
    ),
    violations: v.array(
        v.object({
            fieldPath: v.string(),
            ruleId: v.string(),
            message: v.string(),
        }),
    ),
    rateLimit: v.optional(RateLimitDetailSchema),
});

export type OrderErrorDetail = v.InferOutput<typeof OrderErrorDetailSchema>;
