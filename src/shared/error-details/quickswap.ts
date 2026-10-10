import { ErrorCode, ErrorDetailSchema } from "../../gen/swap/quickswap/v1/quickswap_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
    type QuickSwapErrorTokenAmount,
} from "../error-detail.js";

function tokenAmount(
    amount: { baseUnits: string; decimals: number } | undefined,
): QuickSwapErrorTokenAmount | undefined {
    return amount ? { baseUnits: amount.baseUnits, decimals: amount.decimals } : undefined;
}

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const quickSwap = decodeDetail(raw, ErrorDetailSchema);
    const code = quickSwap && codeName(ErrorCode, quickSwap.code);
    if (!code) return undefined;
    return {
        service: "quickswap",
        code,
        swapId: quickSwap.swapId ? formatId(quickSwap.swapId) : undefined,
        minDepositAmount: tokenAmount(quickSwap.minDepositAmount),
        maxDepositAmount: tokenAmount(quickSwap.maxDepositAmount),
    };
}
