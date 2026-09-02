import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { formatId } from "../../utils/base58-id.js";
import * as Proto from "../../gen/auth/v1/subaccounts_pb.js";
import {
    CreateSubaccountResultSchema,
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
    revision: 1n,
};

describe("subaccount status schemas", () => {
    it("exposes backend status values without display-name remapping", () => {
        expect(
            v.parse(SubaccountSchema, {
                ...baseSubaccount,
                status: Proto.SubaccountStatus.ACTIVE,
            }).status,
        ).toBe("active");
        expect(
            v.parse(SubaccountSchema, {
                ...baseSubaccount,
                status: Proto.SubaccountStatus.DISABLED,
            }).status,
        ).toBe("disabled");
    });

    it("parses smart-account salt nonce metadata", () => {
        expect(
            v.parse(SubaccountSchema, {
                ...baseSubaccount,
                status: Proto.SubaccountStatus.ACTIVE,
                smartAccountSaltNonce: 7,
            }).smartAccountSaltNonce,
        ).toBe(7);
        expect(
            v.parse(CreateSubaccountResultSchema, {
                subaccountId: 1n,
                totalCreated: 7,
                smartAccountSaltNonce: 7,
                revision: 18_446_744_073_709_551_615n,
            }),
        ).toEqual({
            subaccountId: formatId(1n),
            totalCreated: 7,
            smartAccountSaltNonce: 7,
            revision: "18446744073709551615",
        });
    });

    it("maps update status input to backend status values", () => {
        const cases = [
            ["active", Proto.SubaccountStatus.ACTIVE],
            ["disabled", Proto.SubaccountStatus.DISABLED],
        ] as const;

        for (const [status, expected] of cases) {
            expect(
                v.parse(UpdateSubaccountInputSchema, {
                    subaccountId: formatId(1n),
                    expectedRevision: "7",
                    status,
                }).subaccount.status,
            ).toBe(expected);
        }

        expect(() =>
            v.parse(UpdateSubaccountInputSchema, {
                subaccountId: formatId(1n),
                expectedRevision: "7",
                status: "frozen",
            }),
        ).toThrow();
    });

    it("builds a one-field patch without synthesizing omitted values", () => {
        expect(
            v.parse(UpdateSubaccountInputSchema, {
                subaccountId: formatId(1n),
                expectedRevision: "7",
                label: "",
            }),
        ).toEqual({
            subaccountId: 1n,
            subaccount: { label: "" },
            updateMask: { paths: ["label"] },
            expectedRevision: 7n,
        });
    });

    it("keeps empty mutation responses as result objects", () => {
        expect(v.parse(SubaccountMutationResultSchema, {})).toEqual({});
    });
});
