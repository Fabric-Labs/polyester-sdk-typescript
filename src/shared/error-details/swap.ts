import { scaledToDecimal } from "../../catalogs/decimal.js";
import { ErrorCode, ErrorDetailSchema } from "../../gen/swap/v1/swap_pb.js";
import { formatId } from "../../utils/base58-id.js";
import { fromU128 } from "../../utils/u128.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const swap = decodeDetail(raw, ErrorDetailSchema);
    const code = swap && codeName(ErrorCode, swap.code);
    if (!code) return undefined;
    return {
        service: "swap",
        code,
        ...(swap.swapId ? { swapId: formatId(swap.swapId) } : {}),
        ...(swap.minAmountE18
            ? { minAmount: scaledToDecimal(fromU128(swap.minAmountE18), 18) }
            : {}),
        ...(swap.maxAmountE18
            ? { maxAmount: scaledToDecimal(fromU128(swap.maxAmountE18), 18) }
            : {}),
    };
}
