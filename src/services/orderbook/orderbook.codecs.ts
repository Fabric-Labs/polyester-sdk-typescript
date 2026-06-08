import * as Proto from "../../gen/orderbook/v1/orderbook_pb.js";

export const ORDERBOOK_SUPPORTED_DEPTHS = [1, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

export type OrderbookSupportedDepth = (typeof ORDERBOOK_SUPPORTED_DEPTHS)[number];

export const DepthCodec = {
    inputToProto: {
        1: Proto.Depth.DEPTH_1,
        5: Proto.Depth.DEPTH_5,
        10: Proto.Depth.DEPTH_10,
        20: Proto.Depth.DEPTH_20,
        50: Proto.Depth.DEPTH_50,
        100: Proto.Depth.DEPTH_100,
        200: Proto.Depth.DEPTH_200,
        500: Proto.Depth.DEPTH_500,
        1000: Proto.Depth.DEPTH_1000,
    } satisfies Record<OrderbookSupportedDepth, Proto.Depth>,
    supportedDepths: ORDERBOOK_SUPPORTED_DEPTHS,
} as const;
