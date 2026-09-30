import { ProfileErrorCode, ProfileErrorDetailSchema } from "../../gen/auth/v1/profile_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const profile = decodeDetail(raw, ProfileErrorDetailSchema);
    const code = profile && codeName(ProfileErrorCode, profile.code);
    return code
        ? { service: "profile", code, field: profile.field, message: profile.message }
        : undefined;
}
