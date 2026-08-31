import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { PROTOBUF_UINT32_MAX } from "../shared/wire-bounds.js";
import { CreateAddressBookEntryInputSchema } from "./address-book/address-book.schemas.js";
import { ListCandlesInputSchema } from "./candles/candles.schemas.js";
import { createCreateDepositAddressInputSchema } from "./deposit/deposit.schemas.js";
import { ListMarketOverviewInputSchema } from "./market-overview/market-overview.schemas.js";
import { CreateSubaccountPolicyInputSchema } from "./policies/subaccount-policies/subaccount-policies.schemas.js";

const OVER_UINT32 = PROTOBUF_UINT32_MAX + 1;

/**
 * Inputs that land in a protobuf `uint32` field must reject values the wire cannot
 * hold, so callers get a typed validation error instead of an encode crash.
 */
describe("uint32 input bounds", () => {
    const cases: {
        name: string;
        schema: v.GenericSchema;
        over: unknown;
        ok: unknown;
    }[] = [
        {
            name: "deposit chainId",
            schema: createCreateDepositAddressInputSchema() as v.GenericSchema,
            over: { chainId: OVER_UINT32 },
            ok: { chainId: 8453 },
        },
        {
            name: "address book polychainChainId",
            schema: CreateAddressBookEntryInputSchema as v.GenericSchema,
            over: {
                label: "cold wallet",
                entry: {
                    kind: "external",
                    polychainChainId: OVER_UINT32,
                    address: "0xabc",
                },
            },
            ok: {
                label: "cold wallet",
                entry: { kind: "external", polychainChainId: 8453, address: "0xabc" },
            },
        },
        {
            name: "market overview limit",
            schema: ListMarketOverviewInputSchema as v.GenericSchema,
            over: { limit: OVER_UINT32 },
            ok: { limit: 500 },
        },
        {
            name: "candles symbolId",
            schema: ListCandlesInputSchema as v.GenericSchema,
            over: { symbolId: OVER_UINT32, timeframe: "1m" },
            ok: { symbolId: 1, timeframe: "1m" },
        },
        {
            name: "subaccount policy maxOpenOrders",
            schema: CreateSubaccountPolicyInputSchema as v.GenericSchema,
            over: { name: "p", spotMarketScope: "all", maxOpenOrders: OVER_UINT32 },
            ok: { name: "p", spotMarketScope: "all", maxOpenOrders: 10 },
        },
    ];

    it.each(cases)("$name rejects a value over the uint32 maximum", ({ schema, over, ok }) => {
        expect(() => v.parse(schema, over)).toThrow();
        expect(() => v.parse(schema, ok)).not.toThrow();
    });
});
