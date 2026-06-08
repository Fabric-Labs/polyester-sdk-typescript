import type * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";
import * as v from "valibot";
import {
    createCatalogSnapshotReader,
    type CatalogReader,
    type CatalogSnapshot,
} from "../../catalogs/index.js";
import { createCatalogSchemaCache } from "../catalog-schema-cache.js";
import { DepthCodec, type OrderbookSupportedDepth } from "./orderbook.codecs.js";

function toDepthEnum(depth: number): Proto.Depth {
    if (depth in DepthCodec.inputToProto)
        return DepthCodec.inputToProto[depth as OrderbookSupportedDepth];
    const closest = DepthCodec.supportedDepths.reduce((prev, curr) =>
        Math.abs(curr - depth) < Math.abs(prev - depth) ? curr : prev,
    );
    return DepthCodec.inputToProto[closest];
}

export const GetOrderbookInputSchema = v.object({
    symbol: v.string(),
    depth: v.pipe(
        v.optional(v.number(), 50),
        v.transform((v) => toDepthEnum(v)),
    ),
});

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
