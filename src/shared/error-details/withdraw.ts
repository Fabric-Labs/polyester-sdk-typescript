import { ErrorCode, ErrorDetailSchema } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { tsObjToMs } from "../../utils/time.js";
import { fromU128 } from "../../utils/u128.js";
import { E18_SCALE, scaledToDecimalOutput } from "../decimal-surface.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const withdraw = decodeDetail(raw, ErrorDetailSchema);
    const code = withdraw && codeName(ErrorCode, withdraw.code);
    if (!code) return undefined;
    const detail: PolyesterErrorDetail = { service: "withdraw", code };
    if (withdraw.fieldPath) detail.fieldPath = withdraw.fieldPath;
    if (withdraw.minFloorE18) {
        detail.minFloor = scaledToDecimalOutput(fromU128(withdraw.minFloorE18), E18_SCALE);
    }
    const payableFrom = tsObjToMs(withdraw.payableFrom);
    if (payableFrom !== undefined) detail.payableFrom = payableFrom;
    return detail;
}
