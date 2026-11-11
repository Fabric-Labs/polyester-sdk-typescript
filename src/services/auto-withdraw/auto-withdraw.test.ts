import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { AuthErrorCode, AuthErrorDetailSchema } from "../../gen/auth/v1/auth_pb.js";
import * as Proto from "../../gen/chain/withdraw/v1/auto_withdraw_pb.js";
import { ErrorCode, ErrorDetailSchema } from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { createErrorMappingTransport } from "../../shared/connect-error-mapping.js";
import {
    PreconditionFailedError,
    RateLimitError,
    RevisionConflictError,
    ServiceUnavailableError,
    SessionElevationRequiredError,
    StepUpRequiredError,
    TransientError,
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
                createdByAccountId: 77n,
                destinations: [
                    {
                        assetId: 2,
                        destinationChainId: 8453n,
                        destinationAddress: "0xabc",
                        minAmountE18: toU128(10n * E18),
                        maxAmountE18: toU128(1_000_500_000_000_000_000_000n),
                        minFloorE18: toU128(E18 / 2n),
                    },
                ],
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
                    minFloor: "0.5",
                },
            ],
            createdAt: 1_700_000_000_000,
            createdByAccountId: formatId(77n),
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
            createdByAccountId: "",
            destinations: [{ minFloor: null }],
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
    it("sends the step-up token on set and resume, and pauses without one", async () => {
        const { transport, service } = serviceWith({
            rule: rawRule({ version: 4, enabled: false }),
        });

        await service.setRule(setInput({ expectedVersion: 3 }), { stepUpToken: " fresh " });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh",
        );

        // A paused version keeps its destinations, so it can resume to them.
        await expect(
            service.setRuleEnabled({
                account: { subaccountId: formatId(9n) },
                expectedVersion: 3,
                enabled: false,
            }),
        ).resolves.toMatchObject({ version: 4, enabled: false, destinations: [{ assetId: 2 }] });
        expect(transport.lastCall()?.message).toEqual({
            subaccountId: 9n,
            expectedVersion: 3,
            enabled: false,
        });
        expect(new Headers(transport.lastCall()?.headers).has(AUTH_STEP_UP_HEADER_NAME)).toBe(
            false,
        );

        await service.setRuleEnabled(
            { expectedVersion: 4, enabled: true },
            { stepUpToken: "fresh-2" },
        );
        expect(transport.lastCall()?.message).toEqual({ expectedVersion: 4, enabled: true });
        expect(new Headers(transport.lastCall()?.headers).get(AUTH_STEP_UP_HEADER_NAME)).toBe(
            "fresh-2",
        );
        await expect(
            service.setRuleEnabled({ expectedVersion: 4 } as never),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("surfaces step-up and elevation requirements as the typed MFA errors", async () => {
        const authError = (code: AuthErrorCode) =>
            new ConnectError("verification required", Code.PermissionDenied, undefined, [
                { desc: AuthErrorDetailSchema, value: create(AuthErrorDetailSchema, { code }) },
            ]);

        const stepUp = rejectingService(authError(AuthErrorCode.AUTH_STEP_UP_REQUIRED));
        const err = await stepUp.setRule(setInput()).catch((e: unknown) => e);
        expect.soft(err).toBeInstanceOf(StepUpRequiredError);
        expect(isFreshStepUpRequiredError(err)).toBe(true);

        const elevation = rejectingService(authError(AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED));
        await expect(
            elevation.setRuleEnabled({ expectedVersion: 1, enabled: true }),
        ).rejects.toBeInstanceOf(SessionElevationRequiredError);
    });
});

describe("AutoWithdrawService version conflicts", () => {
    const withdrawError = (code: Code, withdrawCode: ErrorCode) =>
        new ConnectError("expected version 2, current 3", code, undefined, [
            { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { code: withdrawCode }) },
        ]);

    it("maps the withdraw version conflict details and bare Aborted to RevisionConflictError", async () => {
        for (const error of [
            withdrawError(Code.Aborted, ErrorCode.VERSION_CONFLICT),
            withdrawError(Code.FailedPrecondition, ErrorCode.CONFLICT),
            withdrawError(Code.Aborted, ErrorCode.CONFLICT),
            new ConnectError("stale", Code.Aborted),
        ]) {
            const service = rejectingService(error);
            for (const call of [
                () => service.setRule(setInput({ expectedVersion: 2 })),
                () => service.setRuleEnabled({ expectedVersion: 2, enabled: false }),
            ]) {
                const err = await call().catch((e: unknown) => e);
                expect(err).toBeInstanceOf(RevisionConflictError);
                expect(isRevisionConflictError(err)).toBe(true);
                expect((err as RevisionConflictError).retryable).toBe(false);
                expect((err as RevisionConflictError).cause).toBe(error);
            }
        }
    });

    it("keeps the typed error of an Aborted that carries a detail", async () => {
        const authAborted = (code: AuthErrorCode) =>
            new ConnectError("verification required", Code.Aborted, undefined, [
                { desc: AuthErrorDetailSchema, value: create(AuthErrorDetailSchema, { code }) },
            ]);
        const cases: [ConnectError, (err: unknown) => void][] = [
            [
                authAborted(AuthErrorCode.AUTH_STEP_UP_REQUIRED),
                (err) => {
                    expect.soft(err).toBeInstanceOf(StepUpRequiredError);
                    expect.soft(isFreshStepUpRequiredError(err)).toBe(true);
                },
            ],
            [
                authAborted(AuthErrorCode.AUTH_MFA_ELEVATION_REQUIRED),
                (err) => expect.soft(err).toBeInstanceOf(SessionElevationRequiredError),
            ],
            [
                withdrawError(Code.Aborted, ErrorCode.STEP_UP_UNAVAILABLE),
                (err) => {
                    expect.soft(err).toBeInstanceOf(ServiceUnavailableError);
                    expect.soft((err as ServiceUnavailableError).retryable).toBe(true);
                },
            ],
            [
                withdrawError(Code.Aborted, ErrorCode.RATE_LIMIT_EXCEEDED),
                (err) => expect.soft(err).toBeInstanceOf(RateLimitError),
            ],
            [
                withdrawError(Code.Aborted, ErrorCode.FUNDS_LOCK_CONFLICT),
                (err) => expect.soft(err).toBeInstanceOf(TransientError),
            ],
            [
                // A detail the SDK cannot decode is not a bare Aborted either.
                Object.assign(new ConnectError("aborted", Code.Aborted), {
                    details: [{ type: "example.v1.UnknownDetail", value: new Uint8Array() }],
                }),
                (err) => expect.soft(err).toBeInstanceOf(TransientError),
            ],
        ];

        for (const [error, check] of cases) {
            const service = rejectingService(error);
            for (const call of [
                () => service.setRule(setInput({ expectedVersion: 2 })),
                () => service.setRuleEnabled({ expectedVersion: 2, enabled: false }),
            ]) {
                const err = await call().catch((e: unknown) => e);
                expect.soft(err, error.rawMessage).not.toBeInstanceOf(RevisionConflictError);
                check(err);
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
                            networkFeeE18: toU128((4n * E18) / 10n),
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
                            networkFee: "0.4",
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
                            networkFee: null,
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

describe("AutoWithdrawService preview", () => {
    it("decodes a preview, keeping unknown amounts and missing destinations null", async () => {
        const { transport, service } = serviceWith({
            status: Proto.AutoWithdrawPreviewStatus.WILL_PAY,
            nextRunAt: ts(1_700_003_600),
            ruleVersion: 3,
            minUsdValueE18: toU128(25n * E18),
            computedAt: ts(1_700_000_000),
            assets: [
                {
                    assetId: 2,
                    destinationChainId: 8453n,
                    destinationAddress: "0xabc",
                    availableE18: toU128(5125n * (E18 / 10n)),
                    payableE18: toU128(500n * E18),
                    heldBackE18: toU128(125n * (E18 / 10n)),
                    holdReason: "above_max",
                    minimumE18: toU128(50n * E18),
                    valueUsdE18: toU128(49995n * (E18 / 100n)),
                    pricedAt: ts(1_699_999_990),
                    networkFeeE18: toU128((4n * E18) / 10n),
                    networkFeeSampledAt: ts(1_699_999_900),
                },
                {
                    assetId: 9,
                    destinationChainId: 0n,
                    destinationAddress: "",
                    availableE18: toU128(E18),
                    payableE18: toU128(0n),
                    heldBackE18: toU128(E18),
                    holdReason: "no_destination",
                },
            ],
        });

        await expect(
            service.previewRun({ account: { subaccountId: formatId(9n) } }),
        ).resolves.toEqual({
            status: "will_pay",
            nextRunAt: 1_700_003_600_000,
            ruleVersion: 3,
            pause: null,
            minUsdValue: "25",
            computedAt: 1_700_000_000_000,
            assets: [
                {
                    assetId: 2,
                    destinationChainId: 8453,
                    destinationAddress: "0xabc",
                    available: "512.5",
                    payable: "500",
                    heldBack: "12.5",
                    holdReason: "above_max",
                    minimum: "50",
                    valueUsd: "499.95",
                    pricedAt: 1_699_999_990_000,
                    networkFee: "0.4",
                    networkFeeSampledAt: 1_699_999_900_000,
                    payableFrom: null,
                },
                {
                    assetId: 9,
                    destinationChainId: null,
                    destinationAddress: null,
                    available: "1",
                    payable: "0",
                    heldBack: "1",
                    holdReason: "no_destination",
                    minimum: null,
                    valueUsd: null,
                    pricedAt: null,
                    networkFee: null,
                    networkFeeSampledAt: null,
                    payableFrom: null,
                },
            ],
        });
        expect(transport.lastCall()?.message).toEqual({ subaccountId: 9n });
    });

    it("decodes a missing rule without a next run", async () => {
        const { service } = serviceWith({
            status: Proto.AutoWithdrawPreviewStatus.NO_RULE,
            ruleVersion: 0,
            computedAt: ts(1_700_000_000),
            assets: [],
        });
        await expect(service.previewRun()).resolves.toEqual({
            status: "no_rule",
            nextRunAt: null,
            ruleVersion: 0,
            pause: null,
            minUsdValue: null,
            computedAt: 1_700_000_000_000,
            assets: [],
        });
    });
});
