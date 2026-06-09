import * as v from "valibot";
import { tsNsToISO, tsNsToMs } from "../../utils/time.js";
import { SideSchema } from "../shared.js";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { FeeSourceCodec, OrderSideCodec } from "../orders/orders.codecs.js";
import { formatId } from "../../utils/base58-id.js";
import { optionalUint64DecimalFilterSchema } from "../../shared/schemas.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import { TradeSideCodec } from "./trades.codecs.js";
import { requiredEnumLabel } from "../../shared/proto-enum-codec.js";

export function createUserTradeSchema(catalog: CatalogSnapshot) {
    return createUserTradeSchemaForReader(createCatalogSnapshotReader(catalog));
}

export function createUserTradeSchemaForReader(reader: CatalogReader) {
    return v.pipe(
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
            const pair = reader.market.requirePairBySymbolId(t.symbolId);
            const baseAssetId = pair.baseAsset.ledgerId;
            const baseAsset = pair.baseAsset;
            const quoteAsset = pair.quoteAsset;
            const feeSourceLabel = requiredEnumLabel(
                FeeSourceCodec.protoToOutput,
                t.feeSource,
                "UserTradeSchema",
                "fee source",
            );
            const feeAsset = feeSourceLabel === "quote" ? quoteAsset : baseAsset;
            const fee = Number(reader.orders.formatFee(t.feeScaled, t.symbolId, t.feeSource));

            return {
                tradeId: t.tradeId ? formatId(t.tradeId) : undefined,
                orderId: formatId(t.orderId),
                subaccountId: t.subaccountId ? formatId(t.subaccountId) : undefined,
                symbolId: t.symbolId,
                symbolLabel: pair.symbol,
                baseAsset,
                quoteAsset,
                feeAsset,
                sideLabel: requiredEnumLabel(
                    OrderSideCodec.protoToOutput,
                    t.side,
                    "UserTradeSchema",
                    "side",
                ),
                liquidityLabel: t.isMaker ? ("maker" as const) : ("taker" as const),
                feeSource: t.feeSource,
                feeSourceLabel,
                baseAssetId,
                qtyDisplay: reader.orders.formatQuantity(t.qtyScaled, t.symbolId),
                priceDisplay: reader.orders.formatPrice(t.priceTicks, t.symbolId),
                fee,
                tsNs: t.tsNs,
                tsIso: tsNsToISO(t.tsNs),
                tsMs: tsNsToMs(t.tsNs),
                matchId: Number(t.matchId),
            };
        }),
    );
}

export type Trade = v.InferOutput<ReturnType<typeof createUserTradeSchema>>;

export function createTradesSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        userTrade: createUserTradeSchemaForReader(reader),
    }));
}

export const GetUserTradesInputSchema = v.pipe(
    v.object({
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

export type GetUserTradesInput = v.InferInput<typeof GetUserTradesInputSchema>;
