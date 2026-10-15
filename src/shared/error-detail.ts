import {
    create,
    fromBinary,
    type DescMessage,
    type MessageInitShape,
    type MessageShape,
} from "@bufbuild/protobuf";
import { ConnectError } from "@connectrpc/connect";
// Type-only: decoders (and the descriptors they need) load on demand, so the
// transport layer doesn't pin every service's file descriptors into the bundle.
import type { AuthErrorCode } from "../gen/auth/v1/auth_pb.js";
import type { ProfileErrorCode } from "../gen/auth/v1/profile_pb.js";
import type { ErrorCode as ClaimsErrorCode } from "../gen/claims/v1/claims_pb.js";
import type { ErrorCode as WithdrawErrorCode } from "../gen/chain/withdraw/v1/withdraw_pb.js";
import type { ErrorCode as LedgerErrorCode } from "../gen/ledger/read/v1/ledger_read_pb.js";
import type { ErrorCode as MarketOverviewErrorCode } from "../gen/marketoverview/v1/marketoverview_pb.js";
import type { ErrorCode as InternalTransferErrorCode } from "../gen/transfer/v1/internal_transfer_pb.js";
import type { OrderErrorDetail } from "../services/orders/order-errors.schemas.js";

type NamedCode<Enum extends Record<number, string>> = keyof Enum;

export type PolyesterErrorDetail =
    | { service: "auth"; code: NamedCode<typeof AuthErrorCode>; message: string }
    | {
          service: "profile";
          code: NamedCode<typeof ProfileErrorCode>;
          field: string;
          message: string;
      }
    | ({ service: "orders" } & OrderErrorDetail)
    | { service: "withdraw"; code: NamedCode<typeof WithdrawErrorCode> }
    | {
          service: "internal_transfer";
          code: NamedCode<typeof InternalTransferErrorCode>;
      }
    | { service: "ledger"; code: NamedCode<typeof LedgerErrorCode> }
    | {
          service: "market_overview";
          code: NamedCode<typeof MarketOverviewErrorCode>;
      }
    | { service: "claims"; code: NamedCode<typeof ClaimsErrorCode> };

export type ConnectErrorDetail = ConnectError["details"][number];

type ErrorDetailDecoder = (raw: ConnectErrorDetail) => PolyesterErrorDetail | undefined;

/** Loads each known detail decoder, keyed by its protobuf type name. */
const DECODER_LOADERS: Record<string, () => Promise<{ decode: ErrorDetailDecoder }>> = {
    "auth.v1.AuthErrorDetail": () => import("./error-details/auth.js"),
    "auth.v1.ProfileErrorDetail": () => import("./error-details/profile.js"),
    "orders.v1.ErrorDetail": () => import("./error-details/orders.js"),
    "chain.withdraw.v1.ErrorDetail": () => import("./error-details/withdraw.js"),
    "transfer.v1.ErrorDetail": () => import("./error-details/internal-transfer.js"),
    "ledger.read.v1.ErrorDetail": () => import("./error-details/ledger.js"),
    "marketoverview.v1.ErrorDetail": () => import("./error-details/market-overview.js"),
    "claims.v1.ErrorDetail": () => import("./error-details/claims.js"),
};

/** Known detail type names, exposed so tests can pin them to the generated descriptors. */
export const ERROR_DETAIL_TYPE_NAMES: readonly string[] = Object.keys(DECODER_LOADERS);

const decoders = new Map<string, ErrorDetailDecoder>();

function detailTypeName(raw: ConnectErrorDetail): string {
    return "desc" in raw ? raw.desc.typeName : raw.type;
}

/**
 * Loads the decoders for the details on `error`, or every decoder when called
 * without an error. SDK transports call this before mapping errors; call it
 * yourself before synchronously mapping a `ConnectError` that did not come
 * through an SDK transport.
 */
export async function loadErrorDetailDecoders(error?: unknown): Promise<void> {
    let typeNames: readonly string[];
    if (error === undefined) typeNames = ERROR_DETAIL_TYPE_NAMES;
    else if (error instanceof ConnectError) typeNames = error.details.map(detailTypeName);
    else return;

    await Promise.all(
        typeNames.map(async (typeName) => {
            const load = DECODER_LOADERS[typeName];
            if (!load || decoders.has(typeName)) return;
            try {
                decoders.set(typeName, (await load()).decode);
            } catch {
                // A failed chunk load only costs the structured detail; the error still maps.
            }
        }),
    );
}

export function codeName<Enum extends Record<number, string>>(
    codes: Enum,
    code: number,
): NamedCode<Enum> | undefined {
    if (typeof code !== "number") return undefined;
    const name = codes[code];
    return typeof name === "string" ? (name as NamedCode<Enum>) : undefined;
}

export function decodeDetail<Desc extends DescMessage>(
    detail: ConnectErrorDetail,
    schema: Desc,
): MessageShape<Desc> | undefined {
    try {
        if ("desc" in detail) {
            return create(schema, detail.value as MessageInitShape<Desc>);
        }
        return fromBinary(schema, detail.value);
    } catch {
        return undefined;
    }
}

/**
 * Decodes the first valid backend rejection detail, preserving wire-detail order.
 * Details decode once {@link loadErrorDetailDecoders} has loaded their decoders.
 */
export function parseConnectErrorDetail(error: ConnectError): PolyesterErrorDetail | undefined {
    for (const raw of error.details) {
        const detail = decoders.get(detailTypeName(raw))?.(raw);
        if (detail) return detail;
    }
    return undefined;
}
