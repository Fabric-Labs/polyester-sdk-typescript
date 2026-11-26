import { ErrorCode, ErrorDetailSchema } from "../../gen/ledger/read/v1/ledger_read_pb.js";
import { tsObjToMs } from "../../utils/time.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const ledger = decodeDetail(raw, ErrorDetailSchema);
    const code = ledger && codeName(ErrorCode, ledger.code);
    if (!code) return undefined;
    const detail: PolyesterErrorDetail = { service: "ledger", code };
    const historyAvailableFrom = tsObjToMs(ledger.historyAvailableFrom);
    if (historyAvailableFrom !== undefined) detail.historyAvailableFrom = historyAvailableFrom;
    return detail;
}
