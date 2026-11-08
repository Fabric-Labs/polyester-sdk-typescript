import * as v from "valibot";
import { RateLimitDetailSchema as RateLimitDetailProtoSchema } from "../../gen/polyester/ratelimit/v1/types_pb.js";
import {
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";
import { RateLimitDetailSchema } from "../rate-limit.schemas.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const detail = decodeDetail(raw, RateLimitDetailProtoSchema);
    const parsed = detail && v.safeParse(RateLimitDetailSchema, detail);
    return parsed?.success
        ? { service: "rate_limit", code: "RATE_LIMIT_EXCEEDED", rateLimit: parsed.output }
        : undefined;
}
