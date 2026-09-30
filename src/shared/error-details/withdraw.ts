import { ErrorCode, ErrorDetailSchema } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const withdraw = decodeDetail(raw, ErrorDetailSchema);
    const code = withdraw && codeName(ErrorCode, withdraw.code);
    return code ? { service: "withdraw", code } : undefined;
}
