import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import * as Proto from "../../gen/transfer/v1/dust_conversion_pb.js";
import { ErrorCode, ErrorDetailSchema } from "../../gen/transfer/v1/internal_transfer_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    AlreadyExistsError,
    PreconditionFailedError,
    RateLimitError,
    ServiceUnavailableError,
    ValidationError,
} from "../../shared/errors.js";
import { rejectingUnaryTransport, unaryTransport } from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import type { SubaccountResolver } from "../subaccount-resolver.js";
import { DustConversionService } from "./dust-conversion.js";

const E18 = 1_000_000_000_000_000_000n;
const u128 = (value: bigint) => ({ hi: value >> 64n, lo: value & ((1n << 64n) - 1n) });
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

const eligibleBalance = {
    assetId: 7,
    amountE18: u128(1n),
    eligibility: Proto.DustAssetEligibility.ELIGIBLE,
    usdValueE18: u128((5n * E18) / 2n),
};
const unpricedBalance = {
    assetId: 9,
    amountE18: u128(12n * E18),
    eligibility: Proto.DustAssetEligibility.NO_PRICE,
};

function rawConversion(overrides: Record<string, unknown> = {}) {
    return {
        conversionId: "conv-1",
        quoteId: "quote-1",
        state: Proto.DustConversionState.PROCESSING,
        refusalCode: ErrorCode.UNSPECIFIED,
        targetAssetId: 2,
        sources: [{ assetId: 7, amountE18: u128(1n) }],
        payoutE18: u128(100n * E18),
        quotedPayoutE18: u128(1_005n * (E18 / 10n)),
        feeE18: u128(E18 / 50n),
        feeBps: 200,
        createdAt: ts(1_700_000_000),
        ...overrides,
    };
}

function serviceWith(response: Record<string, unknown>, resolver?: SubaccountResolver) {
    const transport = unaryTransport(response);
    return {
        transport,
        service: new DustConversionService({ authApi: transport.transport }, resolver),
    };
}

const activeSubaccount: SubaccountResolver = { getDefaultSubaccountId: () => formatId(11n) };

describe("DustConversionService", () => {
    it("lists balances for the active subaccount with exact decimal amounts", async () => {
        const { transport, service } = serviceWith(
            {
                targetAssetId: 2,
                targets: [2, 1],
                feeBps: 200,
                balances: [
                    eligibleBalance,
                    unpricedBalance,
                    { ...eligibleBalance, eligibility: 99 },
                ],
                grossUsdE18: u128((5n * E18) / 2n),
                payoutE18: u128(2_450_000_000_000_000_000n),
                targetAvailable: true,
            },
            activeSubaccount,
        );

        const result = await service.listBalances({ targetAssetId: 2 });

        expect(transport.lastCall()?.method.localName).toBe("listDustBalances");
        expect(transport.lastCall()?.message).toEqual({ subaccountId: 11n, targetAssetId: 2 });
        expect(result).toEqual({
            targetAssetId: 2,
            targets: [2, 1],
            feeBps: 200,
            balances: [
                {
                    assetId: 7,
                    amount: "0.000000000000000001",
                    eligibility: "eligible",
                    usdValue: "2.5",
                },
                { assetId: 9, amount: "12", eligibility: "no_price", usdValue: null },
                {
                    assetId: 7,
                    amount: "0.000000000000000001",
                    eligibility: "unspecified",
                    usdValue: "2.5",
                },
            ],
            grossUsd: "2.5",
            payout: "2.45",
            targetAvailable: true,
        });
    });

    it("quotes in the main account and surfaces every quote field", async () => {
        const { transport, service } = serviceWith(
            {
                quoteId: "quote-1",
                expiresAt: ts(1_700_000_030),
                targetAssetId: 2,
                feeBps: 200,
                grossUsdE18: u128((5n * E18) / 2n),
                payoutE18: u128(2_450_000_000_000_000_000n),
                balances: [eligibleBalance],
                prices: [
                    {
                        assetId: 2,
                        priceTicks: 1_000_000_000n,
                        priceScale: 9,
                        asOf: ts(1_699_999_999),
                    },
                    { assetId: 7, priceTicks: 6_543_210_000n, priceScale: 9 },
                ],
            },
            activeSubaccount,
        );

        const quote = await service.quote({ account: "main", targetAssetId: 2 });

        expect(transport.lastCall()?.message).toEqual({ targetAssetId: 2 });
        expect(quote).toEqual({
            quoteId: "quote-1",
            expiresAt: 1_700_000_030_000,
            targetAssetId: 2,
            feeBps: 200,
            grossUsd: "2.5",
            payout: "2.45",
            balances: [
                {
                    assetId: 7,
                    amount: "0.000000000000000001",
                    eligibility: "eligible",
                    usdValue: "2.5",
                },
            ],
            prices: [
                { assetId: 2, price: "1", asOf: 1_699_999_999_000 },
                { assetId: 7, price: "6.54321", asOf: null },
            ],
        });
    });

    it("converts a quote and returns the processing conversion", async () => {
        const { transport, service } = serviceWith({ conversion: rawConversion() });

        const conversion = await service.create({
            account: { subaccountId: formatId(12n) },
            quoteId: " quote-1 ",
            idempotencyKey: " dust-1 ",
        });

        expect(transport.lastCall()?.method.localName).toBe("createDustConversion");
        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 12n,
            quoteId: " quote-1 ",
            idempotencyKey: " dust-1 ",
        });
        expect(conversion).toEqual({
            conversionId: "conv-1",
            quoteId: "quote-1",
            state: "processing",
            refusalCode: null,
            targetAssetId: 2,
            sources: [{ assetId: 7, amount: "0.000000000000000001" }],
            payout: "100",
            quotedPayout: "100.5",
            fee: "0.02",
            feeBps: 200,
            createdAt: 1_700_000_000_000,
            completedAt: null,
        });
    });

    it("reads a refused conversion with its refusal code", async () => {
        const { transport, service } = serviceWith({
            conversion: rawConversion({
                state: Proto.DustConversionState.REFUSED,
                refusalCode: ErrorCode.DUST_BALANCE_CHANGED,
            }),
        });

        const conversion = await service.get({ conversionId: "conv-1" });

        expect(transport.lastCall()?.message).toEqual({ conversionId: "conv-1" });
        expect(conversion).toMatchObject({ state: "refused", refusalCode: "DUST_BALANCE_CHANGED" });
    });

    it("lists conversions with a page size and token", async () => {
        const { transport, service } = serviceWith({
            conversions: [
                rawConversion({
                    state: Proto.DustConversionState.COMPLETED,
                    completedAt: ts(1_700_000_001),
                }),
            ],
            nextPageToken: "next",
        });

        const page = await service.list({ limit: 100, pageToken: " p " });

        expect(transport.lastCall()?.message).toEqual({ limit: 100, pageToken: "p" });
        expect(page.nextPageToken).toBe("next");
        expect(page.conversions[0]).toMatchObject({
            state: "completed",
            completedAt: 1_700_000_001_000,
        });
        await expect(serviceWith({ conversions: [] }).service.list()).resolves.toEqual({
            conversions: [],
            nextPageToken: "",
        });
    });

    it.each([
        ["list limit 0", (s: DustConversionService) => s.list({ limit: 0 })],
        ["list limit above 100", (s: DustConversionService) => s.list({ limit: 101 })],
        ["a fractional list limit", (s: DustConversionService) => s.list({ limit: 1.5 })],
        ["quote target 0", (s: DustConversionService) => s.quote({ targetAssetId: 0 })],
        [
            "a quote target above uint32",
            (s: DustConversionService) => s.quote({ targetAssetId: 2 ** 32 }),
        ],
        [
            "a balances target above uint32",
            (s: DustConversionService) => s.listBalances({ targetAssetId: 2 ** 32 }),
        ],
        [
            "a blank idempotency key",
            (s: DustConversionService) => s.create({ quoteId: "q", idempotencyKey: "" }),
        ],
        [
            "a missing idempotency key",
            (s: DustConversionService) => s.create({ quoteId: "q" } as never),
        ],
        [
            "a blank quote ID",
            (s: DustConversionService) => s.create({ quoteId: "", idempotencyKey: "k" }),
        ],
        ["a blank conversion ID", (s: DustConversionService) => s.get({ conversionId: "" })],
        [
            "an unknown key",
            (s: DustConversionService) => s.get({ conversionId: "c", extra: 1 } as never),
        ],
        [
            "a legacy subaccountId",
            (s: DustConversionService) => s.get({ conversionId: "c", subaccountId: "x" } as never),
        ],
    ])("rejects %s before sending", async (_name, call) => {
        const { transport, service } = serviceWith({ conversion: rawConversion() });
        await expect(call(service)).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("rejects malformed responses", async () => {
        await expect(
            serviceWith({}).service.get({ conversionId: "conv-1" }),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
            serviceWith({ conversion: rawConversion({ conversionId: "" }) }).service.get({
                conversionId: "conv-1",
            }),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
            serviceWith({
                quoteId: "",
                targetAssetId: 2,
                feeBps: 0,
                balances: [],
                prices: [{ assetId: 2, priceTicks: 1n, priceScale: 19 }],
            }).service.quote({ targetAssetId: 2 }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it.each([
        // The window and the daily limit outlast a retry loop; only DUST_BUSY is retryable.
        [Code.ResourceExhausted, ErrorCode.DUST_WINDOW_ACTIVE, PreconditionFailedError, false],
        [Code.ResourceExhausted, ErrorCode.DUST_DAILY_LIMIT, PreconditionFailedError, false],
        [Code.ResourceExhausted, ErrorCode.DUST_BUSY, RateLimitError, true],
        [Code.FailedPrecondition, ErrorCode.DUST_QUOTE_EXPIRED, PreconditionFailedError, false],
        [Code.FailedPrecondition, ErrorCode.DUST_PRICE_MOVED, PreconditionFailedError, false],
        [Code.AlreadyExists, ErrorCode.IDEMPOTENCY_CONFLICT, AlreadyExistsError, false],
        [Code.Unavailable, ErrorCode.ACCOUNT_SHARD_UNAVAILABLE, ServiceUnavailableError, true],
    ])(
        "maps %s %s to its typed error with the transfer detail",
        async (code, transferCode, type, retryable) => {
            const error = new ConnectError("refused", code, undefined, [
                {
                    desc: ErrorDetailSchema,
                    value: create(ErrorDetailSchema, { code: transferCode }),
                },
            ]);
            const service = new DustConversionService({
                authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
            });
            const rejected = service.create({ quoteId: "quote-1", idempotencyKey: "dust-1" });
            await expect(rejected).rejects.toBeInstanceOf(type);
            await expect(rejected).rejects.toMatchObject({
                retryable,
                detail: { service: "internal_transfer", code: ErrorCode[transferCode] },
            });
        },
    );

    it.each([
        [ErrorCode.DUST_WINDOW_ACTIVE, /last 6 hours/],
        [ErrorCode.DUST_DAILY_LIMIT, /daily dust conversion limit/],
    ])("explains %s when the server sends no message", async (transferCode, message) => {
        const error = new ConnectError("", Code.ResourceExhausted, undefined, [
            { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { code: transferCode }) },
        ]);
        const service = new DustConversionService({
            authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
        });
        await expect(
            service.create({ quoteId: "quote-1", idempotencyKey: "dust-1" }),
        ).rejects.toThrow(message);
    });
});
