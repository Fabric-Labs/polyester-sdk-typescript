import * as v from "../../shared/validation.js";
import { tsNsToISO, tsNsToMs } from "../../utils/time.js";
import { SideSchema } from "../shared.js";
import { FeeAssetCodec, OrderSideCodec } from "../orders/orders.codecs.js";
import { formatId } from "../../utils/base58-id.js";
import { optionalUint64DecimalFilterSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { TradeSideCodec } from "./trades.codecs.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";
import { E18_SCALE, scaledToDecimalOutput, type SdkScales } from "../../shared/decimal-surface.js";
import { fromU128 } from "../../utils/u128.js";

const U128Schema = v.object({
    hi: v.bigint(),
    lo: v.bigint(),
});

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
        }),
        v.transform((t) => {
            const feeAsset = requiredEnumLabel(
                FeeAssetCodec.protoToOutput,
                t.feeAsset,
                "UserTradeSchema",
                "fee asset",
            );
            return {
                orderId: formatId(t.orderId),
                symbolId: t.symbolId,
                sideLabel: requiredEnumLabel(
                    OrderSideCodec.protoToOutput,
                    t.side,
                    "UserTradeSchema",
                    "side",
                ),
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
            };
        }),
    );
}

/** A JSON-safe authenticated trade fill returned by the SDK. */
export type Trade = v.InferOutput<ReturnType<typeof createUserTradeSchema>>;

/** Validates filters accepted by {@link TradesService.list}. */
export const GetUserTradesInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        symbolId: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => {
                if (!v) return undefined;
                const sid = Number(v);
                return Number.isFinite(sid) && sid > 0 ? sid : undefined;
            }),
        ),
        side: v.pipe(
            v.optional(SideSchema),
            v.transform((v) => (v ? TradeSideCodec.inputToProto[v] : undefined)),
        ),
        startTsNs: optionalUint64DecimalFilterSchema("startTsNs"),
        endTsNs: optionalUint64DecimalFilterSchema("endTsNs"),
        limit: v.optional(v.number()),
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

/** Filters accepted by {@link TradesService.list}. */
export type GetUserTradesInput = v.InferInput<typeof GetUserTradesInputSchema>;
