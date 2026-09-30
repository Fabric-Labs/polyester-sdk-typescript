import { AuthErrorCode, AuthErrorDetailSchema } from "../../gen/auth/v1/auth_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const auth = decodeDetail(raw, AuthErrorDetailSchema);
    const code = auth && codeName(AuthErrorCode, auth.code);
    return code ? { service: "auth", code, message: auth.message } : undefined;
}
