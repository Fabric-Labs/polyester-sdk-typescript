import { ErrorCode, ErrorDetailSchema } from "../../gen/transfer/v1/internal_transfer_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const transfer = decodeDetail(raw, ErrorDetailSchema);
    const code = transfer && codeName(ErrorCode, transfer.code);
    return code ? { service: "internal_transfer", code } : undefined;
}
