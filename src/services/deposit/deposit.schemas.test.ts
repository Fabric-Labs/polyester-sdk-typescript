import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { formatId } from "../../utils/base58-id.js";
import {
    createCreateDepositAddressInputSchema,
    createListDepositAddressesInputSchema,
    DepositAddressesSchema,
} from "./deposit.schemas.js";

describe("CreateDepositAddressInputSchema", () => {
    it("accepts explicit chain IDs", () => {
        const schema = createCreateDepositAddressInputSchema();

        const input = v.parse(schema, {
            account: { subaccountId: ` ${formatId(7n)} ` },
            chainId: 8453,
        });

        expect(input).toEqual({
            subaccountId: 7n,
            chainId: 8453,
        });
    });

    it("requires a positive chain ID", () => {
        const schema = createCreateDepositAddressInputSchema();

        expect(() => v.parse(schema, {})).toThrow();
        expect(() => v.parse(schema, { chainId: 0 })).toThrow();
    });
});

describe("ListDepositAddressesInputSchema", () => {
    it("leaves chain ID unset when no optional chain selector is supplied", () => {
        const schema = createListDepositAddressesInputSchema();

        const input = v.parse(schema, {});

        expect(input).toEqual({
            subaccountId: undefined,
            chainId: undefined,
        });
    });
});

describe("DepositAddressesSchema", () => {
    it("trims deposit addresses and rejects invalid chain IDs", () => {
        const addresses = v.parse(DepositAddressesSchema, [
            { chainId: 8453, depositAddress: " 0xabc " },
        ]);

        expect(addresses).toEqual([{ chainId: 8453, depositAddress: "0xabc" }]);
        expect(() =>
            v.parse(DepositAddressesSchema, [{ chainId: 0, depositAddress: "0xabc" }]),
        ).toThrow();
    });
});
