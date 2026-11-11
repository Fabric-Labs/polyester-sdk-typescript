import { ErrorCode, ErrorDetailSchema } from "../../gen/ai/v1/assistant_pb.js";
import {
    codeName,
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const assistant = decodeDetail(raw, ErrorDetailSchema);
    const code = assistant && codeName(ErrorCode, assistant.code);
    return code ? { service: "assistant", code } : undefined;
}
