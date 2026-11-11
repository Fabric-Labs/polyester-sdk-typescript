import { ErrorCode, ErrorDetailSchema } from "../../gen/alerts/v1/price_alerts_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const alert = decodeDetail(raw, ErrorDetailSchema);
    const code = alert && codeName(ErrorCode, alert.code);
    return code ? { service: "alerts", code } : undefined;
}
