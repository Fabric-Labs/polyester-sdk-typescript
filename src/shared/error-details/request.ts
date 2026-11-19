import {
    RequestErrorCode,
    RequestErrorDetailSchema,
} from "../../gen/polyester/api/v1/request_error_pb.js";
import {
    decodeDetail,
    type ConnectErrorDetail,
    type PolyesterErrorDetail,
} from "../error-detail.js";

/** An unknown code decodes to nothing, so the error maps as a plain `resource_exhausted`. */
export function decode(raw: ConnectErrorDetail): PolyesterErrorDetail | undefined {
    const detail = decodeDetail(raw, RequestErrorDetailSchema);
    return detail?.code === RequestErrorCode.REQUEST_TOO_LARGE
        ? { service: "request", code: "REQUEST_TOO_LARGE", limitBytes: Number(detail.limitBytes) }
        : undefined;
}
