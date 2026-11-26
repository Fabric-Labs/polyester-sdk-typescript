import { ErrorCode, ErrorDetailSchema } from "../../gen/ai/v1/assistant_pb.js";
import { formatId } from "../../utils/base58-id.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const assistant = decodeDetail(raw, ErrorDetailSchema);
    const code = assistant && codeName(ErrorCode, assistant.code);
    if (!code) return undefined;
    const detail: PolyesterErrorDetail = { service: "assistant", code };
    if (assistant.pendingApprovalId !== 0n) {
        detail.pendingApprovalId = formatId(assistant.pendingApprovalId);
    }
    return detail;
}
