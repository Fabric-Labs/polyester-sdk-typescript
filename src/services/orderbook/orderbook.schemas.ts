import * as v from "valibot";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { normalizeOrderbookDepth } from "./orderbook.codecs.js";

export const GetOrderbookInputSchema = v.pipe(
    v.object({
        symbol: v.string(),
        depth: v.optional(v.number(), 50),
    }),
    v.transform((input) => {
        const depth = normalizeOrderbookDepth(input.depth);
        return {
            symbol: input.symbol,
            depth: depth.levels,
            protoDepth: depth.protoDepth,
        };
    }),
);

export type GetOrderbookInput = v.InferInput<typeof GetOrderbookInputSchema>;

const OrderbookLevelInputSchema = v.object({
    priceTicks: v.bigint(),
    qtyScaled: v.bigint(),
});

export type OrderbookLevelInput = v.InferOutput<typeof OrderbookLevelInputSchema>;

export function formatOrderbookLevel(
    reader: CatalogReader,
    symbolId: number,
    level: OrderbookLevelInput,
) {
    return {
        priceTicks: level.priceTicks.toString(),
        qtyScaled: level.qtyScaled.toString(),
        priceDisplay: reader.orders.formatPrice(level.priceTicks, symbolId),
        qtyDisplay: reader.orders.formatQuantity(level.qtyScaled, symbolId),
    };
}

export type OrderbookLevel = ReturnType<typeof formatOrderbookLevel>;

export function createOrderbookDataSchema(catalog: CatalogSnapshot) {
    return createOrderbookDataSchemaForReader(createCatalogSnapshotReader(catalog));
}

function createOrderbookDataSchemaForReader(reader: CatalogReader) {
    return v.pipe(
        v.object({
            symbol: v.string(),
            depth: v.number(),
            bookSeq: v.bigint(),
            bids: v.array(OrderbookLevelInputSchema),
            asks: v.array(OrderbookLevelInputSchema),
        }),
        v.transform((d) => {
            const symbolId = reader.market.requireSymbolIdByPairSymbol(d.symbol);
            return {
                ...d,
                bookSeq: d.bookSeq.toString(),
                bids: d.bids.map((level) => formatOrderbookLevel(reader, symbolId, level)),
                asks: d.asks.map((level) => formatOrderbookLevel(reader, symbolId, level)),
            };
        }),
    );
}

export type OrderbookData = v.InferOutput<ReturnType<typeof createOrderbookDataSchema>>;

export function createOrderbookSchemas(catalog: CatalogReader) {
    return createCatalogSchemaCache(catalog, (reader) => ({
        orderbookData: createOrderbookDataSchemaForReader(reader),
    }));
}
