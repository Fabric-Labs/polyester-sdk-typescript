import { AuthErrorCode, AuthErrorDetailSchema } from "../../gen/auth/v1/auth_pb.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const auth = decodeDetail(raw, AuthErrorDetailSchema);
    const code = auth && codeName(AuthErrorCode, auth.code);
    if (!code) return undefined;
    const detail: PolyesterErrorDetail = { service: "auth", code, message: auth.message };
    const retryAfter = tsObjToMs(auth.retryAfter);
    if (retryAfter !== undefined) detail.retryAfter = retryAfter;
    return detail;
}
