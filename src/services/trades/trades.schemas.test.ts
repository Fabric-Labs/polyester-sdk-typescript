import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as ProtoOrders from "../../gen/orders/v1/orders_pb.js";
import { formatId } from "../../utils/base58-id.js";
import { createUserTradeSchema, GetUserTradesInputSchema } from "./trades.schemas.js";

function trade(overrides: Record<string, unknown> = {}) {
    return {
        tradeId: 1n,
        orderId: 2n,
        symbolId: 7,
        side: ProtoOrders.Side.BUY,
        isMaker: false,
        feeSource: ProtoOrders.FeeSource.QUOTE,
        qtyScaled: 1234n,
        priceTicks: 1_000_000n,
        feeScaled: 123n,
        tsNs: 1n,
        matchId: 3n,
        ...overrides,
    };
}

describe("UserTradeSchema", () => {
    it("preserves raw ids, enum labels, quantities, and timestamps", () => {
        const schema = createUserTradeSchema();

        expect(v.parse(schema, trade({ subaccountId: 12n }))).toEqual({
            tradeId: formatId(1n),
            orderId: formatId(2n),
            subaccountId: formatId(12n),
            symbolId: 7,
            sideLabel: "buy",
            liquidityLabel: "taker",
            feeSource: ProtoOrders.FeeSource.QUOTE,
            feeSourceLabel: "quote",
            qtyScaled: "1234",
            priceTicks: "1000000",
            feeScaled: "123",
            tsNs: "1",
            tsIso: "1970-01-01T00:00:00.000Z",
            tsMs: 0,
            matchId: "3",
        });
    });

    it("rejects user trades with unmapped backend fee source values", () => {
        const schema = createUserTradeSchema();

        expect(() =>
            v.parse(schema, trade({ feeSource: ProtoOrders.FeeSource.FEE_SOURCE_UNSPECIFIED })),
        ).toThrow(/\[UserTradeSchema\]: invalid fee source 0/);
    });
});

describe("GetUserTradesInputSchema", () => {
    it("parses supplied timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {
            startTsNs: " 100 ",
            endTsNs: "200",
        });

        expect(input.startTsNs).toBe(100n);
        expect(input.endTsNs).toBe(200n);
    });

    it("omits absent timestamp filters", () => {
        const input = v.parse(GetUserTradesInputSchema, {});

        expect(input.startTsNs).toBeUndefined();
        expect(input.endTsNs).toBeUndefined();
    });

    it("rejects invalid supplied timestamp filters", () => {
        expect(() => v.parse(GetUserTradesInputSchema, { startTsNs: "not-a-ts" })).toThrow();
        expect(() => v.parse(GetUserTradesInputSchema, { endTsNs: "12.3" })).toThrow();
    });
});
