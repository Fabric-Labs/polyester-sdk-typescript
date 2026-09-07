import {
    create,
    fromBinary,
    type DescMessage,
    type MessageInitShape,
    type MessageShape,
} from "@bufbuild/protobuf";
import type { ConnectError } from "@connectrpc/connect";
import * as v from "valibot";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import { ProfileErrorCode, ProfileErrorDetailSchema } from "../gen/auth/v1/profile_pb.js";
import {
    ErrorCode as WithdrawErrorCode,
    ErrorDetailSchema as WithdrawErrorDetailSchema,
} from "../gen/chain/withdraw/v1/withdraw_pb.js";
import {
    ErrorCode as LedgerErrorCode,
    ErrorDetailSchema as LedgerErrorDetailSchema,
} from "../gen/ledger/read/v1/ledger_read_pb.js";
import {
    ErrorCode as MarketOverviewErrorCode,
    ErrorDetailSchema as MarketOverviewErrorDetailSchema,
} from "../gen/marketoverview/v1/marketoverview_pb.js";
import { ErrorDetailSchema as OrderErrorDetailSchema } from "../gen/orders/v1/orders_pb.js";
import {
    ErrorCode as InternalTransferErrorCode,
    ErrorDetailSchema as InternalTransferErrorDetailSchema,
} from "../gen/transfer/v1/internal_transfer_pb.js";
import {
    OrderErrorDetailSchema as ParsedOrderErrorDetailSchema,
    type OrderErrorDetail,
} from "../services/orders/order-errors.schemas.js";

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
      };

function codeName<Enum extends Record<number, string>>(
    codes: Enum,
    code: number,
): NamedCode<Enum> | undefined {
    if (typeof code !== "number") return undefined;
    const name = codes[code];
    return typeof name === "string" ? (name as NamedCode<Enum>) : undefined;
}

function decodeDetail<Desc extends DescMessage>(
    detail: ConnectError["details"][number],
    schema: Desc,
): MessageShape<Desc> | undefined {
    try {
        if ("desc" in detail) {
            return detail.desc.typeName === schema.typeName
                ? create(schema, detail.value as MessageInitShape<Desc>)
                : undefined;
        }
        if (detail.type !== schema.typeName) return undefined;
        return fromBinary(schema, detail.value);
    } catch {
        return undefined;
    }
}

/** Decodes the first valid backend rejection detail, preserving wire-detail order. */
export function parseConnectErrorDetail(error: ConnectError): PolyesterErrorDetail | undefined {
    for (const raw of error.details) {
        const auth = decodeDetail(raw, AuthErrorDetailSchema);
        if (auth) {
            const code = codeName(AuthErrorCode, auth.code);
            if (code && typeof auth.message === "string") {
                return { service: "auth", code, message: auth.message };
            }
            continue;
        }

        const profile = decodeDetail(raw, ProfileErrorDetailSchema);
        if (profile) {
            const code = codeName(ProfileErrorCode, profile.code);
            if (code && typeof profile.field === "string" && typeof profile.message === "string") {
                return { service: "profile", code, field: profile.field, message: profile.message };
            }
            continue;
        }

        const order = decodeDetail(raw, OrderErrorDetailSchema);
        if (order) {
            const parsed = v.safeParse(ParsedOrderErrorDetailSchema, order);
            if (parsed.success) return { service: "orders", ...parsed.output };
            continue;
        }

        const withdraw = decodeDetail(raw, WithdrawErrorDetailSchema);
        if (withdraw) {
            const code = codeName(WithdrawErrorCode, withdraw.code);
            if (code) return { service: "withdraw", code };
            continue;
        }

        const transfer = decodeDetail(raw, InternalTransferErrorDetailSchema);
        if (transfer) {
            const code = codeName(InternalTransferErrorCode, transfer.code);
            if (code) return { service: "internal_transfer", code };
            continue;
        }

        const ledger = decodeDetail(raw, LedgerErrorDetailSchema);
        if (ledger) {
            const code = codeName(LedgerErrorCode, ledger.code);
            if (code) return { service: "ledger", code };
            continue;
        }

        const marketOverview = decodeDetail(raw, MarketOverviewErrorDetailSchema);
        if (marketOverview) {
            const code = codeName(MarketOverviewErrorCode, marketOverview.code);
            if (code) return { service: "market_overview", code };
        }
    }
    return undefined;
}
