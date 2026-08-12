import { ConnectError } from "@connectrpc/connect";
import * as v from "../shared/validation.js";
import { ErrorDetailSchema } from "../gen/orders/v1/orders_pb.js";
import {
    OrderErrorDetailSchema,
    type OrderErrorDetail,
} from "../services/orders/order-errors.schemas.js";
import { toPolyesterError } from "../shared/connect-error-mapping.js";
import { StaleQuoteError } from "../shared/errors.js";

/**
 * Returns the first structured Orders API rejection detail in an error cause chain.
 * Invalid or unrelated details are ignored rather than exposing transport prose.
 */
export function getOrderErrorDetail(error: unknown): OrderErrorDetail | undefined {
    const seen = new Set<unknown>();
    let current: unknown = error;

    for (let depth = 0; depth < 5 && current != null && !seen.has(current); depth += 1) {
        seen.add(current);
        const details = ConnectError.from(current).findDetails(ErrorDetailSchema);
        for (const detail of details) {
            const parsed = v.safeParse(OrderErrorDetailSchema, detail);
            if (parsed.success) return parsed.output;
        }

        current = current instanceof Error ? current.cause : undefined;
    }

    return undefined;
}

/**
 * True when an order mutation was rejected because its client reference quote
 * exceeded the backend's configured drift limit.
 */
export function isStaleQuoteError(error: unknown): boolean {
    let current = error;

    for (let depth = 0; depth < 5; depth += 1) {
        if (toPolyesterError(current) instanceof StaleQuoteError) return true;
        if (!(current instanceof Error) || current.cause === undefined) return false;
        current = current.cause;
    }

    return false;
}
