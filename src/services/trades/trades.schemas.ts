import * as v from "valibot";
import { tsNsToISO, tsNsToMs } from "../../utils/time.js";
import { SideSchema } from "../shared.js";
import { FeeAssetCodec, OrderSideCodec } from "../orders/orders.codecs.js";
import { formatId } from "../../utils/base58-id.js";
import { optionalUint64DecimalFilterSchema, U128Schema } from "../../shared/schemas.js";
import { parseOptionalUint64DecimalStrict } from "../../utils/numbers.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { TradeSideCodec } from "./trades.codecs.js";
import { enumLabel } from "../../shared/proto-enum-codec.js";
import { E18_SCALE, scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { fromU128 } from "../../utils/u128.js";
import { OrderLineageSchema } from "../orders/order-lineage.schemas.js";
import { positiveOrderIdInputSchema } from "../orders/orders-identifiers.schemas.js";

/** Parses a generated user-trade fill into the SDK's JSON-safe public shape. */
export function createUserTradeSchema(scales: SdkScales) {
    return v.pipe(
        v.object({
            orderId: v.bigint(),
            symbolId: v.number(),
            side: v.number(),
            isMaker: v.boolean(),
            feeAsset: v.number(),
            qtyScaled: v.bigint(),
            priceTicks: v.bigint(),
            feeAmountE18: v.optional(U128Schema),
            referralShareAmountE18: v.optional(U128Schema),
            feeIsRebate: v.boolean(),
            tsNs: v.bigint(),
            matchId: v.bigint(),
            lineage: v.optional(OrderLineageSchema),
        }),
        v.transform((t) => {
            const feeAsset = enumLabel(FeeAssetCodec.protoToOutput, t.feeAsset);
            return {
                orderId: formatId(t.orderId),
                symbolId: t.symbolId,
                sideLabel: enumLabel(OrderSideCodec.protoToOutput, t.side),
                liquidityLabel: t.isMaker ? ("maker" as const) : ("taker" as const),
                feeAsset,
                qty: scaledToDecimalOutput(t.qtyScaled, scales.baseQty(t.symbolId)),
                price: scaledToDecimalOutput(t.priceTicks, scales.price()),
                fee: scaledToDecimalOutput(fromU128(t.feeAmountE18), E18_SCALE),
                ...(t.referralShareAmountE18 === undefined
                    ? {}
                    : {
                          referralShare: scaledToDecimalOutput(
                              fromU128(t.referralShareAmountE18),
                              E18_SCALE,
                          ),
                      }),
                feeIsRebate: t.feeIsRebate,
                tsNs: t.tsNs.toString(),
                tsIso: tsNsToISO(t.tsNs),
                tsMs: tsNsToMs(t.tsNs),
                matchId: t.matchId.toString(),
                ...(t.lineage === undefined ? {} : { lineage: t.lineage }),
            };
        }),
    );
}

/** A JSON-safe authenticated trade fill returned by the SDK. */
export type Trade = v.InferOutput<ReturnType<typeof createUserTradeSchema>>;

const AFTER_MATCH_REQUIRES_SYMBOL = "symbolId is required when afterMatchId is set";
const EXECUTION_SCOPE_CONFLICT = "Provide at most one of orderId or lineageId";

const SymbolIdStringSchema = v.pipe(
    v.string(),
    v.trim(),
    v.transform((value) => Number(value)),
);

const GetUserTradesCommonEntries = {
    ...AccountScopeInputEntries,
    side: v.pipe(
        v.optional(SideSchema),
        v.transform((v) => (v ? TradeSideCodec.inputToProto[v] : undefined)),
    ),
    startTsNs: optionalUint64DecimalFilterSchema("startTsNs"),
    endTsNs: optionalUint64DecimalFilterSchema("endTsNs"),
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))),
    pageToken: v.optional(v.pipe(v.string(), v.trim())),
    includeTransfers: v.optional(v.boolean()),
};

const ThroughGenerationSchema = v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(PROTOBUF_UINT32_MAX)),
);

function userTradesScopeSchemas<const TEntries extends v.ObjectEntries>(entries: TEntries) {
    return [
        v.strictObject({
            ...entries,
            orderId: v.optional(v.never()),
            lineageId: v.optional(v.never()),
            throughGeneration: ThroughGenerationSchema,
        }),
        v.strictObject({
            ...entries,
            orderId: positiveOrderIdInputSchema("orderId"),
            lineageId: v.optional(v.never()),
            throughGeneration: ThroughGenerationSchema,
        }),
        v.strictObject({
            ...entries,
            orderId: v.optional(v.never()),
            lineageId: positiveOrderIdInputSchema("lineageId"),
            throughGeneration: ThroughGenerationSchema,
        }),
    ] as const;
}

/** Browse mode: optional symbol filter, no replay cursor. */
const BrowseUserTradesInputSchema = v.union(
    userTradesScopeSchemas({
        ...GetUserTradesCommonEntries,
        symbolId: v.pipe(
            v.optional(SymbolIdStringSchema),
            v.transform((sid) =>
                sid !== undefined && Number.isFinite(sid) && sid > 0 ? sid : undefined,
            ),
        ),
        afterMatchId: v.optional(v.never()),
    }),
);

/** Replay mode: `afterMatchId` cursor, which the backend only accepts scoped to a symbol. */
const ReplayUserTradesInputSchema = v.union(
    userTradesScopeSchemas({
        ...GetUserTradesCommonEntries,
        symbolId: v.pipe(
            SymbolIdStringSchema,
            v.check((sid) => Number.isInteger(sid) && sid > 0, AFTER_MATCH_REQUIRES_SYMBOL),
        ),
        afterMatchId: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.transform((value) => parseOptionalUint64DecimalStrict(value, "afterMatchId")),
        ),
    }),
);

/** Validates filters accepted by {@link TradesService.list}. */
export const GetUserTradesInputSchema = v.pipe(
    v.union([BrowseUserTradesInputSchema, ReplayUserTradesInputSchema], ({ input }) =>
        typeof input === "object" &&
        input !== null &&
        "orderId" in input &&
        input.orderId !== undefined &&
        "lineageId" in input &&
        input.lineageId !== undefined
            ? EXECUTION_SCOPE_CONFLICT
            : AFTER_MATCH_REQUIRES_SYMBOL,
    ),
    v.transform(({ account, orderId, lineageId, ...input }) => {
        const executionScope =
            orderId !== undefined
                ? ({ case: "orderId" as const, value: orderId } as const)
                : lineageId !== undefined
                  ? ({ case: "lineageId" as const, value: lineageId } as const)
                  : undefined;
        return {
            ...input,
            executionScope,
            subaccountId: accountScopeToSubaccountId(account),
        };
    }),
);

/**
 * Filters accepted by {@link TradesService.list}. Passing `afterMatchId` requires
 * `symbolId`; the two shapes form a discriminated union so the constraint is a compile error.
 */
export type GetUserTradesInput = v.InferInput<typeof GetUserTradesInputSchema>;
