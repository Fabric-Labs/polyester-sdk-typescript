import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Proto from "../../gen/auth/v1/resolve_pb.js";
import { unaryTransportSequence } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { ResolveAccountInputSchema } from "./accounts.schemas.js";
import { AccountsService } from "./accounts.js";

describe("AccountsService", () => {
    it("normalizes resolve inputs to proto request payloads", async () => {
        const cases = [
            {
                input: { query: " alice " },
                expected: {
                    query: "alice",
                    hint: Proto.ResolveHint.RESOLVE_HINT_UNSPECIFIED,
                    includeSubaccounts: false,
                },
            },
            {
                input: {
                    query: " 0xabc ",
                    hint: " smartaccount ",
                    includeSubaccounts: true,
                },
                expected: {
                    query: "0xabc",
                    hint: Proto.ResolveHint.SMART_ACCOUNT,
                    includeSubaccounts: true,
                },
            },
            {
                input: {
                    query: "acct_1",
                    hint: "RESOLVE_HINT_PUBLIC_ID",
                },
                expected: {
                    query: "acct_1",
                    hint: Proto.ResolveHint.ID,
                    includeSubaccounts: false,
                },
            },
        ];

        for (const { input, expected } of cases) {
            const signal = new AbortController().signal;
            const transport = unaryTransportSequence([{ matches: [] }]);
            const service = new AccountsService({ authApi: transport.transport });

            await expect(service.resolve(input, { signal })).resolves.toEqual([]);

            expect(transport.calls[0]?.message).toMatchObject(expected);
            expect(transport.calls[0]?.signal).toBe(signal);
        }
    });

    it("parses resolve response matches and defaults omitted matches to an empty list", async () => {
        const transport = unaryTransportSequence([
            {
                matches: [
                    {
                        smartAccountAddress: "0xabc",
                        kind: "sub",
                        rootUsername: "alice",
                        subaccountLabel: "maker",
                        accountId: 42n,
                    },
                ],
            },
            {},
        ]);
        const service = new AccountsService({ authApi: transport.transport });

        await expect(service.resolve({ query: "alice" })).resolves.toEqual([
            {
                smartAccountAddress: "0xabc",
                kind: "sub",
                rootUsername: "alice",
                subaccountLabel: "maker",
                accountId: formatId(42n),
            },
        ]);
        await expect(service.resolve({ query: "missing" })).resolves.toEqual([]);
    });

    it("rejects malformed resolve responses", async () => {
        const transport = unaryTransportSequence([
            {
                matches: [
                    {
                        smartAccountAddress: "0xabc",
                        kind: "team",
                        accountId: 1n,
                    },
                ],
            },
        ]);
        const service = new AccountsService({ authApi: transport.transport });

        await expect(service.resolve({ query: "alice" })).rejects.toThrow();
    });
});

describe("ResolveAccountInputSchema", () => {
    it("parses aliases and rejects blank queries", () => {
        for (const hint of ["USERNAME", "id", "PUBLIC_ID", "smart_account", "smartaccount"]) {
            expect(v.parse(ResolveAccountInputSchema, { query: " alice ", hint })).toMatchObject({
                query: "alice",
            });
        }

        expect(() => v.parse(ResolveAccountInputSchema, { query: "   " })).toThrow();
    });
});
