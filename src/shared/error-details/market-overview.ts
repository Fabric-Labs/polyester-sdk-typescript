import { ErrorCode, ErrorDetailSchema } from "../../gen/marketoverview/v1/marketoverview_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const marketOverview = decodeDetail(raw, ErrorDetailSchema);
    const code = marketOverview && codeName(ErrorCode, marketOverview.code);
    return code ? { service: "market_overview", code } : undefined;
}
