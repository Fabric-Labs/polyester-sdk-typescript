import type { ConnectError } from "@connectrpc/connect";
import { ErrorDetailSchema } from "../../gen/marketdata/v1/marketdata_pb.js";
import {
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

type MarketDataErrorCode = Extract<PolyesterErrorDetail, { service: "market_data" }>["code"];

// The codes the detail is attached to; market data sends the code as the error message.
const CODES: readonly MarketDataErrorCode[] = [
    "BAD_REQUEST",
    "INVALID_ARGUMENT",
    "UNKNOWN_SYMBOL",
    "NOT_FOUND",
    "PAGE_TOKEN_INVALID",
];

/** An unknown code decodes to nothing, so the error maps by its gRPC code alone. */
export function decode(
    raw: ConnectErrorDetail,
    error: ConnectError,
): PolyesterErrorDetail | undefined {
    const detail = decodeDetail(raw, ErrorDetailSchema);
    const code = CODES.find((known) => known === error.rawMessage);
    return detail && code ? { service: "market_data", code, reason: detail.reason } : undefined;
}
