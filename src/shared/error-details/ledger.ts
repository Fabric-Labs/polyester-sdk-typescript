import { ErrorCode, ErrorDetailSchema } from "../../gen/ledger/read/v1/ledger_read_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const ledger = decodeDetail(raw, ErrorDetailSchema);
    const code = ledger && codeName(ErrorCode, ledger.code);
    return code ? { service: "ledger", code } : undefined;
}
