import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import {
    SubaccountMutationResultSchema,
    SubaccountSchema,
    UpdateSubaccountInputSchema,
} from "./subaccounts.schemas.js";

const baseSubaccount = {
    id: 1n,
    role: Proto.SubaccountRole.OWNER,
    smartAccountAddress: "0xabc",
    ownerRootSmartAccountAddress: "0xabc",
    subaccountPolicyId: 1n,
};

describe("subaccount status schemas", () => {
    it("exposes backend status values without display-name remapping", () => {
        expect(v.parse(SubaccountSchema, { ...baseSubaccount, status: "active" }).status).toBe(
            "active",
        );
        expect(v.parse(SubaccountSchema, { ...baseSubaccount, status: "disabled" }).status).toBe(
            "disabled",
        );
        expect(v.parse(SubaccountSchema, { ...baseSubaccount, status: "deleted" }).status).toBe(
            "deleted",
        );
    });

    it("maps update status input to backend status values", () => {
        for (const status of ["active", "disabled", "deleted"] as const) {
            expect(
                v.parse(UpdateSubaccountInputSchema, {
                    subaccountId: "1",
                    status,
                }).status,
            ).toBe(status);
        }

        expect(() =>
            v.parse(UpdateSubaccountInputSchema, {
                subaccountId: "1",
                status: "frozen",
            }),
        ).toThrow();
    });

    it("keeps empty mutation responses as result objects", () => {
        expect(v.parse(SubaccountMutationResultSchema, {})).toEqual({});
    });
});
