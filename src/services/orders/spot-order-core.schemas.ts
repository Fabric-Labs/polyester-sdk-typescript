import * as ProtoWrite from "../../gen/orders/v1/orders_pb.js";

export type SpotOrderCoreInput = {
    symbol: string;
    side: ProtoWrite.Side;
    orderType: ProtoWrite.OrderType;
    tif: ProtoWrite.TIF;
    qtyScaled: bigint;
    priceTicks?: bigint;
    feeSource?: ProtoWrite.FeeSource;
    stpMode?: ProtoWrite.STPMode;
    postOnly?: boolean;
};

type BuildSpotOrderCoreOptions = {
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
    input: SpotOrderCoreInput,
    options: BuildSpotOrderCoreOptions & { defaultStpMode: ProtoWrite.STPMode },
): SpotOrderCoreWithDefaultStp;
export function buildSpotOrderCore(
    input: SpotOrderCoreInput,
    options?: BuildSpotOrderCoreOptions,
): SpotOrderCore;
export function buildSpotOrderCore(
    input: SpotOrderCoreInput,
    options: BuildSpotOrderCoreOptions = {},
): SpotOrderCore {
    const priceTicks =
        input.orderType === ProtoWrite.OrderType.LIMIT && input.priceTicks ? input.priceTicks : 0n;

    return {
        symbol: input.symbol,
        side: input.side,
        orderType: input.orderType,
        tif: input.tif,
        qtyScaled: input.qtyScaled,
        priceTicks,
        feeSource: input.feeSource ?? ProtoWrite.FeeSource.QUOTE,
        stpMode: input.stpMode ?? options.defaultStpMode,
        postOnly: input.postOnly ?? false,
    };
}
