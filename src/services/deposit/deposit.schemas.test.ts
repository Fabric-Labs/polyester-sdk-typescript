import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { createTestCatalog } from "../../testing/catalog.js";
import {
    createCreateDepositAddressInputSchema,
    createListDepositAddressesInputSchema,
    DepositAddressesSchema,
} from "./deposit.schemas.js";

function zipperCatalog() {
    return createTestCatalog({
        zipper: {
            chains: [
                {
                    chainId: 8453,
                    code: "BASE",
                    name: "Base",
                    nativeChainId: "8453",
                    nativeCurrencySymbol: "ETH",
                    explorerUrl: "https://basescan.org",
                    icon: "base.svg",
                    requiredConfirmations: 12,
                    confirmationTimeSeconds: 2,
                    isCaseSensitive: false,
                    minAddressLength: 42,
                    maxAddressLength: 42,
                },
            ],
            assets: [],
        },
    }).snapshot();
}

describe("CreateDepositAddressInputSchema", () => {
    it("resolves chain codes through the zipper catalog", () => {
        const schema = createCreateDepositAddressInputSchema(zipperCatalog());

        const input = v.parse(schema, {
            subaccountId: " 7 ",
            chainCode: "BASE",
        });

        expect(input).toEqual({
            subaccountId: 7n,
            chainId: 8453,
        });
    });

    it("accepts explicit chain IDs without catalog lookup", () => {
        const schema = createCreateDepositAddressInputSchema(zipperCatalog());

        const input = v.parse(schema, { chainId: 8453 });

        expect(input.chainId).toBe(8453);
    });

    it("requires a known chain selector", () => {
        const schema = createCreateDepositAddressInputSchema(zipperCatalog());

        expect(() => v.parse(schema, {})).toThrow("chainId or chainCode is required");
        expect(() => v.parse(schema, { chainCode: "UNKNOWN" })).toThrow();
    });
});

describe("ListDepositAddressesInputSchema", () => {
    it("leaves chain ID unset when no optional chain selector is supplied", () => {
        const schema = createListDepositAddressesInputSchema(zipperCatalog());

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
