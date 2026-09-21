import { describe, expect, expectTypeOf, it } from "vitest";
import {
    realtimeClientStub,
    unaryTransport,
    unaryTransportSequence,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { WalletChallengePurpose } from "../../gen/auth/v1/auth_pb.js";
import { ValidationError, ServiceUnavailableError } from "../../shared/errors.js";
import { LoginWithWalletInputSchema } from "./auth.js";
import { CreateSubaccountInputSchema } from "../subaccounts/subaccounts.schemas.js";
import { parse } from "../../shared/validation.js";
import { AuthService } from "./auth.js";

describe("AuthService", () => {
    it("accepts terms explicitly through the auth transport and recovers after failure", async () => {
        const failure = new Error("temporary failure");
        const transport = unaryTransport((_call, index) => {
            if (index === 0) throw failure;
            return {};
        });
        const publicTransport = unaryTransport({});
        const service = new AuthService(
            { publicApi: publicTransport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );
        const signal = new AbortController().signal;

        expect(transport.calls).toHaveLength(0);
        await expect(service.acceptTerms()).rejects.toBe(failure);
        await expect(service.acceptTerms({ signal })).resolves.toBeUndefined();
        await expect(service.acceptTerms()).resolves.toBeUndefined();
        expect(transport.calls).toHaveLength(3);
        expect(transport.calls[1]).toMatchObject({
            method: { localName: "acceptTerms" },
            message: {},
            signal,
        });
        expect(publicTransport.calls).toHaveLength(0);
    });

    it("returns the stable public API key ID from caller introspection", async () => {
        const transport = unaryTransportSequence([
            {
                accountId: 1n,
                apiKeyId: "ak_0123456789abcdef0123456789abcdef",
                username: "alice",
            },
            { accountId: 1n, username: "alice" },
        ]);
        const service = new AuthService(
            { publicApi: transport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        await expect(service.me()).resolves.toEqual({
            accountId: formatId(1n),
            apiKeyId: "ak_0123456789abcdef0123456789abcdef",
            username: "alice",
        });
        await expect(service.me()).resolves.toEqual({
            accountId: formatId(1n),
            username: "alice",
        });
    });

    it("returns a JSON-safe epoch-millisecond challenge expiry", async () => {
        const transport = unaryTransport({
            message: "server message",
            expiresAt: { seconds: 1_785_940_604n, nanos: 369_342_000 },
        });
        const service = new AuthService(
            { publicApi: transport.transport, authApi: transport.transport },
            realtimeClientStub().realtime,
        );

        const challenge = await service.createWalletChallenge({
            smartAccountAddress: "0x1111111111111111111111111111111111111111",
            signerAddress: "0x1111111111111111111111111111111111111111",
            uri: "https://app.example",
        });

        expect(challenge).toEqual({ message: "server message", expiresAt: 1_785_940_604_369 });
        expectTypeOf(challenge.expiresAt).toEqualTypeOf<number | undefined>();
        expect(new Date(challenge.expiresAt ?? NaN).getTime()).toBe(1_785_940_604_369);
        expect(JSON.stringify(challenge)).toBe(
            '{"message":"server message","expiresAt":1785940604369}',
        );
    });
});

const challengeInput = {
    smartAccountAddress: "0x1111111111111111111111111111111111111111",
    signerAddress: "0x1111111111111111111111111111111111111111",
    uri: "https://app.example:8443",
};

function challengeService(response: Parameters<typeof unaryTransport>[0]) {
    const publicApi = unaryTransport(response);
    const authApi = unaryTransport({});
    const service = new AuthService(
        { publicApi: publicApi.transport, authApi: authApi.transport },
        realtimeClientStub().realtime,
    );
    return { service, publicApi, authApi };
}

describe("wallet challenges", () => {
    it("maps login challenges through the public transport and preserves exact message bytes", async () => {
        const message = "  server SIWE message ☃\nwith final newline\n";
        const { service, publicApi, authApi } = challengeService({ message });
        const signal = new AbortController().signal;
        await expect(service.createWalletChallenge(challengeInput, { signal })).resolves.toEqual({
            message,
        });
        expect(publicApi.calls[0]).toMatchObject({
            method: { localName: "createWalletChallenge" },
            signal,
            message: { ...challengeInput, purpose: WalletChallengePurpose.LOGIN },
        });
        expect(authApi.calls).toHaveLength(0);
    });

    it.each([
        "https://app.example/path",
        "https://app.example/",
        "https://app.example?q=1",
        "https://app.example#fragment",
        "https://user:pass@app.example",
        "file:///tmp",
        "not-an-origin",
    ])("rejects invalid origin %s before transport", async (uri) => {
        const { service, publicApi } = challengeService({ message: "message" });
        await expect(
            service.createWalletChallenge({ ...challengeInput, uri }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(publicApi.calls).toHaveLength(0);
    });

    it("rejects the removed purpose field before transport", async () => {
        const { service, publicApi } = challengeService({ message: "message" });
        for (const purpose of ["login", "create_subaccount"]) {
            await expect(
                // @ts-expect-error Exercise untyped consumers.
                service.createWalletChallenge({ ...challengeInput, purpose }),
            ).rejects.toBeInstanceOf(ValidationError);
        }
        expect(publicApi.calls).toHaveLength(0);
    });

    it("enforces the 4096-byte message bound for responses and both consuming inputs", async () => {
        const atLimit = "é".repeat(2048);
        const overLimit = atLimit + "a";
        const { service } = challengeService((_call, index) => ({
            message: index === 0 ? atLimit : overLimit,
        }));
        await expect(service.createWalletChallenge(challengeInput)).resolves.toMatchObject({
            message: atLimit,
        });
        await expect(service.createWalletChallenge(challengeInput)).rejects.toBeInstanceOf(
            ValidationError,
        );
        const input = {
            smartAccountAddress: challengeInput.smartAccountAddress,
            message: atLimit,
            signature: "0x" + "a".repeat(130),
        };
        for (const schema of [LoginWithWalletInputSchema, CreateSubaccountInputSchema]) {
            expect(parse(schema, input).message).toBe(atLimit);
            expect(() => parse(schema, { ...input, message: overLimit })).toThrow(ValidationError);
            expect(() => parse(schema, { ...input, nonce: "obsolete" })).toThrow(ValidationError);
            expect(() =>
                parse(schema, { ...input, primaryWalletAddress: challengeInput.signerAddress }),
            ).toThrow(ValidationError);
        }
    });

    it("requires a 65-byte hexadecimal EOA signature for login", () => {
        const input = {
            smartAccountAddress: challengeInput.smartAccountAddress,
            message: "message",
            signature: "a".repeat(130),
        };
        expect(parse(LoginWithWalletInputSchema, input).signature).toBe(input.signature);
        expect(
            parse(LoginWithWalletInputSchema, { ...input, signature: `0x${input.signature}` })
                .signature,
        ).toBe(`0x${input.signature}`);
        for (const signature of [
            "a".repeat(128),
            "a".repeat(132),
            "g".repeat(130),
            "a".repeat(8192),
            "",
        ]) {
            expect(() => parse(LoginWithWalletInputSchema, { ...input, signature })).toThrow(
                ValidationError,
            );
        }
    });

    it("preserves universal signatures up to 8192 characters for subaccount creation", () => {
        const input = {
            smartAccountAddress: challengeInput.smartAccountAddress,
            message: "message",
            signature: "a".repeat(8192),
        };
        expect(parse(CreateSubaccountInputSchema, input).signature).toHaveLength(8192);
        expect(() =>
            parse(CreateSubaccountInputSchema, { ...input, signature: input.signature + "a" }),
        ).toThrow(ValidationError);
        expect(() => parse(CreateSubaccountInputSchema, { ...input, signature: "" })).toThrow(
            ValidationError,
        );
    });

    it("preserves typed failures and permits a subsequent challenge request", async () => {
        const failure = new ServiceUnavailableError("temporarily unavailable");
        const { service } = challengeService((_call, index) => {
            if (index === 0) throw failure;
            return { message: "fresh challenge" };
        });
        await expect(service.createWalletChallenge(challengeInput)).rejects.toBe(failure);
        await expect(service.createWalletChallenge(challengeInput)).resolves.toMatchObject({
            message: "fresh challenge",
        });
    });
});
