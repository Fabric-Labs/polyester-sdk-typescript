import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";
import type { CatalogReader } from "../../catalogs/index.js";
import { parsePriceTicks } from "../../utils/numbers.js";

export type SpotOrderCoreInput = {
    symbol: string;
    side: ProtoWrite.Side;
    orderType: ProtoWrite.OrderType;
    tif: ProtoWrite.TIF;
    qty: string;
    price?: string;
    feeSource?: ProtoWrite.FeeSource;
    stpMode?: ProtoWrite.STPMode;
    postOnly?: boolean;
};

type BuildSpotOrderCoreOptions = {
    priceFieldName?: string;
    defaultStpMode?: ProtoWrite.STPMode;
};

type SpotOrderCoreBase = Pick<
    ProtoWrite.CreateOrderRequest,
    "symbol" | "side" | "orderType" | "tif" | "qtyScaled" | "priceTicks" | "feeSource" | "postOnly"
>;

export type SpotOrderCore = SpotOrderCoreBase & {
    stpMode: ProtoWrite.STPMode | undefined;
};

export type SpotOrderCoreWithDefaultStp = SpotOrderCoreBase & {
    stpMode: ProtoWrite.STPMode;
};

export function buildSpotOrderCore(
    reader: CatalogReader,
    input: SpotOrderCoreInput,
    options: BuildSpotOrderCoreOptions & { defaultStpMode: ProtoWrite.STPMode },
): SpotOrderCoreWithDefaultStp;
export function buildSpotOrderCore(
    reader: CatalogReader,
    input: SpotOrderCoreInput,
    options?: BuildSpotOrderCoreOptions,
): SpotOrderCore;
export function buildSpotOrderCore(
    reader: CatalogReader,
    input: SpotOrderCoreInput,
    options: BuildSpotOrderCoreOptions = {},
): SpotOrderCore {
    const price = input.orderType === ProtoWrite.OrderType.LIMIT ? input.price : undefined;

    reader.orders.validateOrderInput({
        pair: input.symbol,
        quantity: input.qty,
        price,
    });

    return {
        symbol: input.symbol,
        side: input.side,
        orderType: input.orderType,
        tif: input.tif,
        qtyScaled: reader.orders.parseQuantity(input.qty, input.symbol).value,
        priceTicks: price ? parsePriceTicks(price, options.priceFieldName ?? "price") : 0n,
        feeSource: input.feeSource ?? ProtoWrite.FeeSource.QUOTE,
        stpMode: input.stpMode ?? options.defaultStpMode,
        postOnly: input.postOnly ?? false,
    };
}
