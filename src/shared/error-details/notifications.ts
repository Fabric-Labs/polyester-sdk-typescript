import { ErrorCode, ErrorDetailSchema } from "../../gen/notifications/v1/notifications_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const notification = decodeDetail(raw, ErrorDetailSchema);
    const code = notification && codeName(ErrorCode, notification.code);
    return code ? { service: "notifications", code } : undefined;
}
