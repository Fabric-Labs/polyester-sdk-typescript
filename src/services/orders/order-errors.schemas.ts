import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import * as v from "valibot";
import { PRICE_SCALE } from "../../catalogs/readers.js";
import { scaledToDecimalOutput } from "../../shared/decimal-surface.js";
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

export const OrderErrorDetailSchema = v.pipe(
    v.object({
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
        /**
         * With `LADDER_LEVEL_REJECTED`: the code the refused ladder order would return as a single
         * order, such as `MAX_OPEN_ORDERS_PER_PAIR`. Absent for every other error.
         */
        causeCode: v.pipe(
            v.optional(v.number(), 0),
            v.transform((code) => (code ? orderErrorCodeName(code) : undefined)),
        ),
        /**
         * With `LADDER_LEVEL_REJECTED`: the refused order's zero-based index among the ladder's
         * levels (`0` is the first). Absent for every other error.
         */
        levelIndex: v.optional(v.number()),
        priceBandLimitTicks: v.optional(v.bigint()),
    }),
    v.transform(({ priceBandLimitTicks, ...detail }) => ({
        ...detail,
        /**
         * With `PRICE_BAND_VIOLATION` on a preview: the band limit the limit price is past, as a
         * decimal price (the highest admitted buy price, or the lowest admitted sell price).
         * Absent for every other error.
         */
        ...(priceBandLimitTicks !== undefined && {
            priceBandLimit: scaledToDecimalOutput(priceBandLimitTicks, PRICE_SCALE),
        }),
    })),
);

export type OrderErrorDetail = v.InferOutput<typeof OrderErrorDetailSchema>;
