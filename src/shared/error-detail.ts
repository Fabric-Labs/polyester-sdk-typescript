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
import type { ErrorCode as AssistantErrorCode } from "../gen/ai/v1/assistant_pb.js";
import type { ErrorCode as PriceAlertErrorCode } from "../gen/alerts/v1/price_alerts_pb.js";
import type { AuthErrorCode } from "../gen/auth/v1/auth_pb.js";
import type { ProfileErrorCode } from "../gen/auth/v1/profile_pb.js";
import type { ErrorCode as ClaimsErrorCode } from "../gen/claims/v1/claims_pb.js";
import type { ErrorCode as WithdrawErrorCode } from "../gen/chain/withdraw/v1/withdraw_pb.js";
import type { ErrorCode as LedgerErrorCode } from "../gen/ledger/read/v1/ledger_read_pb.js";
import type { ErrorCode as MarketOverviewErrorCode } from "../gen/marketoverview/v1/marketoverview_pb.js";
import type { ErrorCode as NotificationErrorCode } from "../gen/notifications/v1/notifications_pb.js";
import type { ErrorCode as SwapErrorCode } from "../gen/swap/v1/swap_pb.js";
import type { ErrorCode as StrategiesErrorCode } from "../gen/strategies/v1/strategies_pb.js";
import type { ErrorCode as InternalTransferErrorCode } from "../gen/transfer/v1/internal_transfer_pb.js";
import type { OrderErrorDetail } from "../services/orders/order-errors.schemas.js";
import type { RateLimitDetail } from "./rate-limit.schemas.js";

type NamedCode<Enum extends Record<number, string>> = keyof Enum;

export type PolyesterErrorDetail =
    | {
          service: "auth";
          code: NamedCode<typeof AuthErrorCode>;
          message: string;
          /**
           * Epoch ms from which the same request may succeed; with `AUTH_SOCIAL_ACCOUNT_COOLDOWN`
           * and `AUTH_SOCIAL_CHANGE_LIMIT_REACHED`.
           */
          retryAfter?: number;
          /**
           * With `AUTH_TIMESTAMP_SKEW`: the server time (epoch ms) and the window a signed
           * request's timestamp must fall in, from `serverTimeMs - recvWindowMs` to
           * `serverTimeMs + maxFutureMs`. Compare `serverTimeMs` with the signing clock.
           */
          timestampWindow?: { serverTimeMs: number; recvWindowMs: number; maxFutureMs: number };
      }
    | {
          service: "profile";
          code: NamedCode<typeof ProfileErrorCode>;
          field: string;
          message: string;
      }
    | ({ service: "orders" } & OrderErrorDetail)
    | {
          service: "withdraw";
          code: NamedCode<typeof WithdrawErrorCode>;
          /** Request field the refusal concerns, such as `destinations[0].min_amount_e18`. */
          fieldPath?: string;
          /** Least amount the destination accepts, as a decimal; with `MIN_AMOUNT_BELOW_FLOOR`. */
          minFloor?: string;
          /** Epoch ms when a cooling-down destination can be paid; retry after it. */
          payableFrom?: number;
      }
    | {
          service: "internal_transfer";
          code: NamedCode<typeof InternalTransferErrorCode>;
      }
    | { service: "ledger"; code: NamedCode<typeof LedgerErrorCode> }
    | {
          service: "market_overview";
          code: NamedCode<typeof MarketOverviewErrorCode>;
      }
    | {
          service: "claims";
          code: NamedCode<typeof ClaimsErrorCode>;
          /** Claim the error concerns; set only with `CLAIM_OUTCOME_UNKNOWN`. */
          claimId?: string;
      }
    | {
          service: "swap";
          code: NamedCode<typeof SwapErrorCode>;
          /** The swap already bound to the idempotency key; with `IDEMPOTENCY_CONFLICT`. */
          swapId?: string;
          /**
           * With `AMOUNT_OUT_OF_RANGE`, when known: the smallest source amount that quotes and the
           * largest current depth absorbs, as decimals. Guidance, not a guarantee.
           */
          minAmount?: string;
          maxAmount?: string;
      }
    | { service: "alerts"; code: NamedCode<typeof PriceAlertErrorCode> }
    | { service: "assistant"; code: NamedCode<typeof AssistantErrorCode> }
    | { service: "notifications"; code: NamedCode<typeof NotificationErrorCode> }
    | {
          service: "strategies";
          code: NamedCode<typeof StrategiesErrorCode>;
          /** Request field the error is about, e.g. `settings[0].value`; with `SETTINGS_INVALID`, `FUNDING_INVALID` and `MANIFEST_TOO_LARGE`. */
          fieldPath?: string;
          /** Epoch ms when the same request may succeed; with `SCENARIO_RUN_LIMIT_REACHED` and `BACKTEST_LIMIT_REACHED`. */
          retryAfter?: number;
          /** With `BOT_CAP_REACHED`; the next tier fields are 0 when no tier lifts the cap. */
          botCap?: {
              vipTier: number;
              botCap: number;
              bots: number;
              nextVipTier: number;
              nextBotCap: number;
          };
          /** Markets not open to bots, as the manifest names them; with `MARKET_NOT_ALLOWED`. */
          markets?: string[];
          /** Amounts the funding account lacks, one per asset; with `INSUFFICIENT_FUNDS`. */
          shortfall?: { asset: string; amount: string }[];
          /** With `STRATEGY_CAP_REACHED`: the cap and how many strategies the account has. */
          strategyCap?: { strategyCap: number; strategies: number };
          /**
           * With `DRAFT_REVISION_CONFLICT`: the strategy's current revision, a decimal string, and
           * its version; a matching `headVersionId` means your own save already landed.
           */
          revisionConflict?: { revision: string; headVersionId: string };
      }
    /** A request over the API's size limit; `limitBytes` is the limit it exceeded. */
    | { service: "request"; code: "REQUEST_TOO_LARGE"; limitBytes: number }
    /** A service's quota refusal sent as a bare `RateLimitDetail`, e.g. wallet sign-in. */
    | { service: "rate_limit"; code: "RATE_LIMIT_EXCEEDED"; rateLimit: RateLimitDetail };

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
    "swap.v1.ErrorDetail": () => import("./error-details/swap.js"),
    "alerts.v1.ErrorDetail": () => import("./error-details/alerts.js"),
    "ai.v1.ErrorDetail": () => import("./error-details/assistant.js"),
    "notifications.v1.ErrorDetail": () => import("./error-details/notifications.js"),
    "strategies.v1.ErrorDetail": () => import("./error-details/strategies.js"),
    "polyester.ratelimit.v1.RateLimitDetail": () => import("./error-details/rate-limit.js"),
    "polyester.api.v1.RequestErrorDetail": () => import("./error-details/request.js"),
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
