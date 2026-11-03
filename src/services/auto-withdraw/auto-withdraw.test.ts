import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { AuthErrorCode, AuthErrorDetailSchema } from "../../gen/auth/v1/auth_pb.js";
import * as Proto from "../../gen/chain/withdraw/v1/auto_withdraw_pb.js";
import { ErrorCode, ErrorDetailSchema } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    PreconditionFailedError,
    RevisionConflictError,
    SessionElevationRequiredError,
    StepUpRequiredError,
    ValidationError,
} from "../../shared/errors.js";
import { AUTH_STEP_UP_HEADER_NAME } from "../../shared/request-options.js";
import {
    rejectingUnaryTransport,
    subaccountResolverStub,
    unaryTransport,
} from "../../testing/service-harness.js";
import { formatId } from "../../utils/base58-id.js";
import { isFreshStepUpRequiredError } from "../../utils/connect-mfa-errors.js";
import { isRevisionConflictError } from "../../utils/errors.js";
import { toU128 } from "../../utils/u128.js";
import { AutoWithdrawService } from "./auto-withdraw.js";
import type { SetAutoWithdrawRuleInput } from "./auto-withdraw.schemas.js";

const E18 = 10n ** 18n;
const ts = (seconds: number) => ({ seconds: BigInt(seconds), nanos: 0 });

const destination = {
    assetId: 2,
    destinationChainId: 8453,
    destinationAddress: " 0xabc ",
    minAmount: "10",
    maxAmount: "1000.5",
};

function rawRule(overrides: Record<string, unknown> = {}) {
    return {
        subaccountId: 0n,
        version: 3,
        enabled: true,
        schedule: { cadence: Proto.AutoWithdrawCadence.WEEKLY, weekday: 5, minuteOfDay: 90 },
        destinations: [
            {
                assetId: 2,
                destinationChainId: 8453n,
                destinationAddress: "0xabc",
                minAmountE18: toU128(10n * E18),
                maxAmountE18: toU128(1_000_500_000_000_000_000_000n),
            },
        ],
        createdAt: ts(1_700_000_000),
        ...overrides,
    };
}

function setInput(overrides: Partial<SetAutoWithdrawRuleInput> = {}): SetAutoWithdrawRuleInput {
    return {
        expectedVersion: 0,
        schedule: { cadence: "daily", minuteOfDay: 0 },
        destinations: [destination],
        ...overrides,
    };
}

function serviceWith(response: Record<string, unknown> = { rule: rawRule() }) {
    const transport = unaryTransport(response);
    return { transport, service: new AutoWithdrawService({ authApi: transport.transport }) };
}

function rejectingService(error: ConnectError) {
    return new AutoWithdrawService({
        authApi: createErrorMappingTransport(rejectingUnaryTransport(error)),
    });
}

describe("AutoWithdrawService schedule validation", () => {
    it.each([
        [
            { cadence: "hourly", minuteOfHour: 59 },
            { cadence: 3, minuteOfHour: 59 },
        ],
        [
            { cadence: "daily", minuteOfDay: 1439 },
            { cadence: 1, minuteOfDay: 1439 },
        ],
        [
            { cadence: "weekly", weekday: "sunday", minuteOfDay: 0 },
            { cadence: 2, weekday: 7, minuteOfDay: 0 },
        ],
        [
            { cadence: "biweekly", weekday: "monday", minuteOfDay: 30, anchorDate: "2026-11-04" },
            { cadence: 4, weekday: 1, minuteOfDay: 30, anchorDate: "2026-11-04" },
        ],
        [
            { cadence: "monthly", dayOfMonth: 31, minuteOfDay: 600 },
            { cadence: 5, dayOfMonth: 31, minuteOfDay: 600 },
        ],
    ] as const)("sends a valid %o schedule", async (schedule, expected) => {
        const { transport, service } = serviceWith();
        await service.setRule(setInput({ schedule }));
        expect(transport.lastCall()?.message.schedule).toEqual(expected);
    });

    it.each([
        ["hourly with minuteOfDay", { cadence: "hourly", minuteOfHour: 0, minuteOfDay: 0 }],
        ["hourly minute out of range", { cadence: "hourly", minuteOfHour: 60 }],
        ["daily with weekday", { cadence: "daily", minuteOfDay: 0, weekday: "monday" }],
        ["daily with minuteOfHour", { cadence: "daily", minuteOfDay: 0, minuteOfHour: 5 }],
        ["daily minute out of range", { cadence: "daily", minuteOfDay: 1440 }],
        ["weekly without weekday", { cadence: "weekly", minuteOfDay: 0 }],
        ["weekly with ISO weekday number", { cadence: "weekly", weekday: 1, minuteOfDay: 0 }],
        [
            "weekly with anchorDate",
            { cadence: "weekly", weekday: "monday", minuteOfDay: 0, anchorDate: "2026-11-02" },
        ],
        ["biweekly without anchorDate", { cadence: "biweekly", weekday: "monday", minuteOfDay: 0 }],
        [
            "biweekly with impossible date",
            { cadence: "biweekly", weekday: "monday", minuteOfDay: 0, anchorDate: "2026-02-30" },
        ],
        [
            "biweekly with non-ISO date",
            { cadence: "biweekly", weekday: "monday", minuteOfDay: 0, anchorDate: "11/02/2026" },
        ],
        ["monthly day 0", { cadence: "monthly", dayOfMonth: 0, minuteOfDay: 0 }],
        ["monthly day 32", { cadence: "monthly", dayOfMonth: 32, minuteOfDay: 0 }],
        [
            "monthly with weekday",
            { cadence: "monthly", dayOfMonth: 1, minuteOfDay: 0, weekday: "monday" },
        ],
        ["unknown cadence", { cadence: "yearly", minuteOfDay: 0 }],
    ])("rejects %s before sending", async (_name, schedule) => {
        const { transport, service } = serviceWith();
        await expect(
            service.setRule(setInput({ schedule: schedule as never })),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("rejects destination counts outside 1–32, duplicate assets and bad versions", async () => {
        const { transport, service } = serviceWith();
        const many = Array.from({ length: 33 }, (_, i) => ({ ...destination, assetId: i + 1 }));
        for (const input of [
            setInput({ destinations: [] }),
            setInput({ destinations: many }),
            setInput({ destinations: [destination, { ...destination }] }),
            setInput({ expectedVersion: -1 }),
            setInput({ expectedVersion: 1.5 }),
        ]) {
            await expect(service.setRule(input)).rejects.toBeInstanceOf(ValidationError);
        }
        await expect(
            service.setRule(setInput({ destinations: many.slice(0, 32) })),
        ).resolves.toBeDefined();
        expect(transport.calls).toHaveLength(1);
    });
});

describe("AutoWithdrawService U128 decimal conversions", () => {
    it("encodes decimal amounts as exact 18-decimal U128 values", async () => {
        const { transport, service } = serviceWith();
        const u128Max = (1n << 128n) - 1n;
        await service.setRule(
            setInput({
                destinations: [
                    { ...destination, minAmount: "0.000000000000000001", maxAmount: "1000.5" },
                    {
                        ...destination,
                        assetId: 3,
                        minAmount: "0",
                        maxAmount: "340282366920938463463.374607431768211455",
                    },
                ],
                minUsdValue: "25.75",
            }),
        );

        expect(transport.lastCall()?.message).toEqual({
            expectedVersion: 0,
            schedule: { cadence: 1, minuteOfDay: 0 },
            destinations: [
                {
                    assetId: 2,
                    destinationChainId: 8453n,
                    destinationAddress: "0xabc",
                    minAmountE18: toU128(1n),
                    maxAmountE18: toU128(1_000_500_000_000_000_000_000n),
                },
                {
                    assetId: 3,
                    destinationChainId: 8453n,
                    destinationAddress: "0xabc",
                    minAmountE18: toU128(0n),
                    maxAmountE18: toU128(u128Max),
                },
            ],
            minUsdValueE18: toU128(25_750_000_000_000_000_000n),
        });
    });

    it.each([
        ["more than 18 decimals", { minAmount: "0.0000000000000000001" }],
        ["above U128", { maxAmount: "340282366920938463463.374607431768211456" }],
        ["negative", { minAmount: "-1" }],
        ["not a decimal", { maxAmount: "1e3" }],
        ["max below min", { minAmount: "5", maxAmount: "4" }],
        ["zero max", { minAmount: "0", maxAmount: "0" }],
    ])("rejects an amount %s", async (_name, amounts) => {
        const { transport, service } = serviceWith();
        await expect(
            service.setRule(setInput({ destinations: [{ ...destination, ...amounts }] })),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(transport.calls).toHaveLength(0);
    });

    it("rejects a USD minimum with more than 18 decimals and omits it when null", async () => {
        const { transport, service } = serviceWith();
        await expect(
            service.setRule(setInput({ minUsdValue: "0.0000000000000000001" })),
        ).rejects.toBeInstanceOf(ValidationError);
        await service.setRule(setInput({ minUsdValue: null }));
        expect(transport.lastCall()?.message).not.toHaveProperty("minUsdValueE18");
    });

    it("decodes a rule's amounts, enums, ids and times", async () => {
        const { service } = serviceWith({
            rule: rawRule({
                subaccountId: 42n,
                minUsdValueE18: toU128(100n * E18 + 1n),
                pause: {
                    assetId: 2,
                    reason: "destination_not_whitelisted",
                    pausedAt: ts(1_700_000_100),
                },
            }),
        });

        await expect(service.getRule()).resolves.toEqual({
            subaccountId: formatId(42n),
            version: 3,
            enabled: true,
            schedule: { cadence: "weekly", weekday: "friday", minuteOfDay: 90 },
            destinations: [
                {
                    assetId: 2,
                    destinationChainId: 8453,
                    destinationAddress: "0xabc",
                    minAmount: "10",
                    maxAmount: "1000.5",
                },
            ],
            createdAt: 1_700_000_000_000,
            pause: {
                assetId: 2,
                reason: "destination_not_whitelisted",
                pausedAt: 1_700_000_100_000,
            },
            minUsdValue: "100.000000000000000001",
        });
    });

    it("decodes a root rule with no USD minimum, no pause and an unknown cadence", async () => {
        const { service } = serviceWith({
            rule: rawRule({ schedule: { cadence: 99 }, minUsdValueE18: toU128(0n) }),
        });
        await expect(service.getRule()).resolves.toMatchObject({
            subaccountId: "",
            schedule: { cadence: "unspecified" },
            pause: null,
            minUsdValue: null,
        });
    });
});

describe("AutoWithdrawService account scope", () => {
    it("returns null without a rule and scopes reads to the resolved account", async () => {
        const transport = unaryTransport({});
        const service = new AutoWithdrawService(
            { authApi: transport.transport },
            subaccountResolverStub(formatId(42n)),
        );

        await expect(service.getRule()).resolves.toBeNull();
        expect(transport.lastCall()?.message).toEqual({ subaccountId: 42n });

        await service.getRule({ account: "main" });
        expect(transport.lastCall()?.message).toEqual({});

        await service.getRule({ account: { subaccountId: formatId(7n) } });
        expect(transport.lastCall()?.message).toEqual({ subaccountId: 7n });

        await expect(
            service.getRule({ subaccountId: formatId(7n) } as never),
        ).rejects.toBeInstanceOf(ValidationError);
    });
});

describe("AutoWithdrawService step-up", () => {
    it("sends the step-up token on set and disable", async () => {
        const { transport, service } = serviceWith({
            rule: rawRule({ version: 4, enabled: false, destinations: [] }),
        });

        await service.setRule(setInput({ expectedVersion: 3 }), { stepUpToken: " fresh " });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh",
        );

        await expect(
            service.disableRule(
                { account: { subaccountId: formatId(9n) }, expectedVersion: 3 },
                { stepUpToken: "fresh-2" },
            ),
        ).resolves.toMatchObject({ version: 4, enabled: false, destinations: [] });
        expect(transport.lastCall()?.message).toEqual({ subaccountId: 9n, expectedVersion: 3 });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh-2",
        );
    });

    it("surfaces step-up and elevation requirements as the typed MFA errors", async () => {
        const authError = (code: AuthErrorCode) =>
            new ConnectError("verification required", Code.PermissionDenied, undefined, [
                { desc: AuthErrorDetailSchema, value: create(AuthErrorDetailSchema, { code }) },
            ]);

        const stepUp = rejectingService(authError(AuthErrorCode.AUTH_STEP_UP_REQUIRED));
        const err = await stepUp.setRule(setInput()).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(StepUpRequiredError);
        expect(isFreshStepUpRequiredError(err)).toBe(true);

        const elevation = rejectingService(authError(AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED));
        await expect(elevation.disableRule({ expectedVersion: 1 })).rejects.toBeInstanceOf(
            SessionElevationRequiredError,
        );
    });
});

describe("AutoWithdrawService version conflicts", () => {
    const withdrawError = (code: Code, withdrawCode: ErrorCode) =>
        new ConnectError("expected version 2, current 3", code, undefined, [
            { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { code: withdrawCode }) },
        ]);

    it("maps the withdraw CONFLICT detail and bare Aborted to RevisionConflictError", async () => {
        for (const error of [
            withdrawError(Code.FailedPrecondition, ErrorCode.CONFLICT),
            withdrawError(Code.Aborted, ErrorCode.CONFLICT),
            new ConnectError("stale", Code.Aborted),
        ]) {
            const service = rejectingService(error);
            for (const call of [
                () => service.setRule(setInput({ expectedVersion: 2 })),
                () => service.disableRule({ expectedVersion: 2 }),
            ]) {
                const err = await call().catch((e: unknown) => e);
                expect(err).toBeInstanceOf(RevisionConflictError);
                expect(isRevisionConflictError(err)).toBe(true);
                expect((err as RevisionConflictError).retryable).toBe(false);
                expect((err as RevisionConflictError).cause).toBe(error);
            }
        }
    });

    it("leaves other write failures unchanged", async () => {
        const service = rejectingService(
            withdrawError(Code.FailedPrecondition, ErrorCode.EXTERNAL_DESTINATION_NOT_WHITELISTED),
        );
        const err = await service.setRule(setInput()).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PreconditionFailedError);
        expect(err).not.toBeInstanceOf(RevisionConflictError);
    });
});

describe("AutoWithdrawService runs", () => {
    it("sends paging input and decodes a page of runs", async () => {
        const { transport, service } = serviceWith({
            runs: [
                {
                    runSeq: 12n,
                    ruleVersion: 3,
                    scheduledFor: ts(1_700_003_600),
                    state: Proto.AutoWithdrawRunState.RUN_PARTIALLY_FAILED,
                    reason: "",
                    steps: [
                        {
                            assetId: 2,
                            destinationChainId: 8453n,
                            destinationAddress: "0xabc",
                            availableE18: toU128(1_500n * E18),
                            amountE18: toU128(1_000_500_000_000_000_000_000n),
                            state: Proto.AutoWithdrawStepState.STEP_COMPLETED,
                            reason: "",
                            intentId: "intent-1",
                            txHash: "0xdead",
                            valueUsdE18: toU128(999n * E18),
                        },
                        {
                            assetId: 3,
                            destinationChainId: 1n,
                            destinationAddress: "0xdef",
                            availableE18: toU128(5n),
                            amountE18: toU128(0n),
                            state: Proto.AutoWithdrawStepState.STEP_SKIPPED,
                            reason: "below_minimum",
                            intentId: "",
                            txHash: "",
                        },
                    ],
                    createdAt: ts(1_700_003_601),
                    finishedAt: ts(1_700_003_700),
                },
                {
                    runSeq: 11n,
                    ruleVersion: 3,
                    scheduledFor: ts(1_700_000_000),
                    state: 42,
                    reason: "nothing_to_pay",
                    steps: [],
                    createdAt: ts(1_700_000_001),
                },
            ],
            nextPageToken: "cursor-2",
        });

        const page = await service.listRuns({
            account: "main",
            limit: 2,
            pageToken: " cursor-1 ",
        });
        expect(transport.lastCall()?.message).toEqual({ limit: 2, pageToken: "cursor-1" });
        expect(page).toEqual({
            runs: [
                {
                    runSeq: "12",
                    ruleVersion: 3,
                    scheduledFor: 1_700_003_600_000,
                    state: "partially_failed",
                    reason: null,
                    steps: [
                        {
                            assetId: 2,
                            destinationChainId: 8453,
                            destinationAddress: "0xabc",
                            available: "1500",
                            amount: "1000.5",
                            valueUsd: "999",
                            state: "completed",
                            reason: null,
                            intentId: "intent-1",
                            txHash: "0xdead",
                        },
                        {
                            assetId: 3,
                            destinationChainId: 1,
                            destinationAddress: "0xdef",
                            available: "0.000000000000000005",
                            amount: "0",
                            valueUsd: null,
                            state: "skipped",
                            reason: "below_minimum",
                            intentId: null,
                            txHash: null,
                        },
                    ],
                    createdAt: 1_700_003_601_000,
                    finishedAt: 1_700_003_700_000,
                },
                {
                    runSeq: "11",
                    ruleVersion: 3,
                    scheduledFor: 1_700_000_000_000,
                    state: "unspecified",
                    reason: "nothing_to_pay",
                    steps: [],
                    createdAt: 1_700_000_001_000,
                    finishedAt: null,
                },
            ],
            nextPageToken: "cursor-2",
        });
    });

    it("defaults paging and rejects an out-of-range limit", async () => {
        const { transport, service } = serviceWith({ runs: [], nextPageToken: "" });
        await expect(service.listRuns({ account: "main" })).resolves.toEqual({
            runs: [],
            nextPageToken: "",
        });
        expect(transport.lastCall()?.message).toEqual({ limit: 0, pageToken: "" });
        await expect(service.listRuns({ limit: 101 })).rejects.toBeInstanceOf(ValidationError);
    });
});
