import { ErrorCode, ErrorDetailSchema } from "../../gen/claims/v1/claims_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const claims = decodeDetail(raw, ErrorDetailSchema);
    const code = claims && codeName(ErrorCode, claims.code);
    if (!code) return undefined;
    return claims.claimId
        ? { service: "claims", code, claimId: claims.claimId }
        : { service: "claims", code };
}
