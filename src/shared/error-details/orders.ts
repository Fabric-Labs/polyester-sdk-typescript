import * as v from "valibot";
import { ErrorDetailSchema } from "../../gen/orders/v1/orders_pb.js";
import { OrderErrorDetailSchema } from "../../services/orders/order-errors.schemas.js";
import {
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const order = decodeDetail(raw, ErrorDetailSchema);
    if (!order) return undefined;
    const parsed = v.safeParse(OrderErrorDetailSchema, order);
    return parsed.success ? { service: "orders", ...parsed.output } : undefined;
}
