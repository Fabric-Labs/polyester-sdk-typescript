import * as v from "valibot";
import { tsNsToISO, tsNsToMs } from "../../utils/time.js";
import { parseOptionalUint64Decimal } from "../../utils/numbers.js";
import { SideSchema } from "../shared.js";
import {
    feeSourceLabelFor,
    formatQtyForSymbol,
    formatPriceForSymbol,
    sideLabelFor,
    int18ToDecimalString,
} from "../../catalogs/orders-catalog.js";
import {
    baseAssetForSymbolId,
    quoteAssetForSymbolId,
    baseAssetIdForSymbolId,
    symbolForSymbolId,
} from "../../catalogs/market-data-catalog.js";
import { formatId } from "../../utils/base58-id.js";
import { optionalSubAccountIdInputSchema } from "../../shared/schemas.js";
import { TradeSideCodec } from "./trades.codecs.js";

export const UserTradeSchema = v.pipe(
    v.object({
        tradeId: v.optional(v.bigint()),
        orderId: v.bigint(),
        subaccountId: v.optional(v.bigint()),
        symbolId: v.number(),
        side: v.number(),
        isMaker: v.boolean(),
        feeSource: v.number(),
        qtyScaled: v.bigint(),
        priceTicks: v.bigint(),
        feeScaled: v.bigint(),
        tsNs: v.bigint(),
        matchId: v.bigint(),
    }),
    v.transform((t) => {
        const baseAssetId = baseAssetIdForSymbolId(t.symbolId);
        const baseAsset = baseAssetForSymbolId(t.symbolId);
        const quoteAsset = quoteAssetForSymbolId(t.symbolId);
        // 1=QUOTE fee paid in quote asset, 2=RECEIVED fee paid in base asset
        const feeAsset = t.feeSource === 1 ? quoteAsset : baseAsset;
        const fee = Number(int18ToDecimalString(t.feeScaled));

        return {
            tradeId: t.tradeId ? formatId(t.tradeId) : undefined,
            orderId: formatId(t.orderId),
            subaccountId: t.subaccountId ? formatId(t.subaccountId) : undefined,
            symbolId: t.symbolId,
            symbolLabel: symbolForSymbolId(t.symbolId),
            baseAsset,
            quoteAsset,
            feeAsset,
            sideLabel: sideLabelFor(t.side),
            liquidityLabel: t.isMaker ? ("maker" as const) : ("taker" as const),
            feeSource: t.feeSource,
            feeSourceLabel: feeSourceLabelFor(t.feeSource),
            baseAssetId,
            qtyDisplay: formatQtyForSymbol(t.qtyScaled, t.symbolId),
            priceDisplay: formatPriceForSymbol(t.priceTicks, t.symbolId),
            fee,
            tsNs: t.tsNs,
            tsIso: tsNsToISO(t.tsNs),
            tsMs: tsNsToMs(t.tsNs),
            matchId: Number(t.matchId),
        };
    }),
);

export type Trade = v.InferOutput<typeof UserTradeSchema>;

export const GetUserTradesInputSchema = v.pipe(
    v.object({
        subAccountId: optionalSubAccountIdInputSchema(),
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
        startTsNs: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => {
                if (!v) return undefined;
                const ts = parseOptionalUint64Decimal(v);
                return ts !== undefined ? ts : undefined;
            }),
        ),
        endTsNs: v.pipe(
            v.optional(v.pipe(v.string(), v.trim())),
            v.transform((v) => {
                if (!v) return undefined;
                const ts = parseOptionalUint64Decimal(v);
                return ts !== undefined ? ts : undefined;
            }),
        ),
        limit: v.optional(v.number()),
        pageToken: v.optional(v.pipe(v.string(), v.trim())),
    }),
    v.transform(({ subAccountId, ...rest }) => ({
        ...rest,
        subaccountId: subAccountId,
    })),
);

export type GetUserTradesInput = v.InferInput<typeof GetUserTradesInputSchema>;
