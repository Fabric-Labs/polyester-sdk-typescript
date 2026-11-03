import * as v from "valibot";
import * as Proto from "../../gen/chain/withdraw/v1/auto_withdraw_pb.js";
import {
    AccountScopeInputEntries,
    accountScopeToSubaccountId,
} from "../../shared/account-scope.js";
import {
    decimalInputToScaled,
    E18_SCALE,
    scaledToDecimalOutput,
} from "../../shared/decimal-surface.js";
import { ValidationError } from "../../shared/errors.js";
import { enumLabel, enumLabelSchema } from "../../shared/proto-enum-codec.js";
import {
    BigIntStringSchema,
    OptionalTimestampMsSchema,
    PublicIdOrEmptySchema,
    TimestampMsSchema,
    U128Schema,
} from "../../shared/schemas.js";
import { PROTOBUF_UINT32_MAX } from "../../shared/wire-bounds.js";
import type { DecodedEnum } from "../../utils/types.js";
import { fromU128, toU128 } from "../../utils/u128.js";
import { PositiveUint32InputSchema } from "../shared.js";
import {
    AUTO_WITHDRAW_WEEKDAY_VALUES,
    AutoWithdrawCadenceCodec,
    AutoWithdrawRunStateCodec,
    AutoWithdrawStepStateCodec,
    AutoWithdrawWeekdayCodec,
    type AutoWithdrawPauseReason,
    type AutoWithdrawRunReason,
    type AutoWithdrawStepReason,
    type AutoWithdrawWeekday,
} from "./auto-withdraw.codecs.js";

const U128_MAX = (1n << 128n) - 1n;

/** Decimal string → 18-decimal U128 integer, exact; throws `ValidationError`. */
function decimalToE18(field: string, value: string): bigint {
    const scaled = decimalInputToScaled(field, value, E18_SCALE);
    if (scaled > U128_MAX) {
        throw new ValidationError(`${field} exceeds the maximum supported value: ${value}`);
    }
    return scaled;
}

function e18ToDecimal(value: v.InferOutput<typeof U128Schema> | undefined): string {
    return scaledToDecimalOutput(fromU128(value), E18_SCALE);
}

const AccountScopedInputSchema = v.strictObject({ ...AccountScopeInputEntries });

export type AutoWithdrawScopedInput = v.InferInput<typeof AccountScopedInputSchema>;

export const AutoWithdrawScopedInputSchema = v.pipe(
    AccountScopedInputSchema,
    v.transform(({ account }) => ({ subaccountId: accountScopeToSubaccountId(account) })),
);

const Uint32InputSchema = v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(PROTOBUF_UINT32_MAX),
);
const MinuteOfDaySchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439));
const MinuteOfHourSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(59));
const DayOfMonthSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31));
const WeekdaySchema = v.picklist(AUTO_WITHDRAW_WEEKDAY_VALUES);
const AnchorDateSchema = v.pipe(
    v.string(),
    v.trim(),
    v.isoDate("anchorDate must be a UTC date, YYYY-MM-DD"),
    v.check((date) => {
        const parsed = new Date(`${date}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
    }, "anchorDate must be a real calendar date"),
);

/**
 * A rule's UTC run slot. Each cadence takes only its own fields; any other field is rejected.
 * `minuteOfDay` is minutes after 00:00 UTC (0–1439), `minuteOfHour` 0–59, `dayOfMonth` 1–31
 * (a shorter month runs on its last day), and `anchorDate` is a UTC date in a week a biweekly
 * rule runs.
 */
export const AutoWithdrawScheduleInputSchema = v.pipe(
    v.variant("cadence", [
        v.strictObject({ cadence: v.literal("hourly"), minuteOfHour: MinuteOfHourSchema }),
        v.strictObject({ cadence: v.literal("daily"), minuteOfDay: MinuteOfDaySchema }),
        v.strictObject({
            cadence: v.literal("weekly"),
            weekday: WeekdaySchema,
            minuteOfDay: MinuteOfDaySchema,
        }),
        v.strictObject({
            cadence: v.literal("biweekly"),
            weekday: WeekdaySchema,
            minuteOfDay: MinuteOfDaySchema,
            anchorDate: AnchorDateSchema,
        }),
        v.strictObject({
            cadence: v.literal("monthly"),
            dayOfMonth: DayOfMonthSchema,
            minuteOfDay: MinuteOfDaySchema,
        }),
    ]),
    v.transform((schedule) => ({
        cadence: AutoWithdrawCadenceCodec.inputToProto[schedule.cadence],
        weekday:
            "weekday" in schedule
                ? AutoWithdrawWeekdayCodec.inputToProto[schedule.weekday]
                : undefined,
        minuteOfDay: "minuteOfDay" in schedule ? schedule.minuteOfDay : undefined,
        minuteOfHour: "minuteOfHour" in schedule ? schedule.minuteOfHour : undefined,
        dayOfMonth: "dayOfMonth" in schedule ? schedule.dayOfMonth : undefined,
        anchorDate: "anchorDate" in schedule ? schedule.anchorDate : undefined,
    })),
);

export type AutoWithdrawScheduleInput = v.InferInput<typeof AutoWithdrawScheduleInputSchema>;

/**
 * One asset paid in kind to one whitelisted external-chain address. `minAmount` and
 * `maxAmount` are decimal asset amounts (up to 18 decimals); a run pays the balance up to
 * `maxAmount` once it reaches `minAmount`.
 */
const AutoWithdrawDestinationInputSchema = v.pipe(
    v.strictObject({
        assetId: PositiveUint32InputSchema,
        destinationChainId: v.pipe(
            v.number(),
            v.integer(),
            v.gtValue(0),
            v.maxValue(Number.MAX_SAFE_INTEGER),
        ),
        destinationAddress: v.pipe(v.string(), v.trim(), v.minLength(1)),
        minAmount: v.string(),
        maxAmount: v.string(),
    }),
    v.transform(({ minAmount, maxAmount, destinationChainId, ...destination }) => {
        const min = decimalToE18("minAmount", minAmount);
        const max = decimalToE18("maxAmount", maxAmount);
        if (max === 0n || max < min) {
            throw new ValidationError(
                `maxAmount must be greater than 0 and at least minAmount: ${maxAmount}`,
            );
        }
        return {
            ...destination,
            destinationChainId: BigInt(destinationChainId),
            minAmountE18: toU128(min),
            maxAmountE18: toU128(max),
        };
    }),
);

export type AutoWithdrawDestinationInput = v.InferInput<typeof AutoWithdrawDestinationInputSchema>;

export const SetAutoWithdrawRuleInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** The version this change replaces: 0 when the account has no rule yet. */
        expectedVersion: Uint32InputSchema,
        schedule: AutoWithdrawScheduleInputSchema,
        destinations: v.pipe(
            v.array(AutoWithdrawDestinationInputSchema),
            v.minLength(1, "At least one destination is required."),
            v.maxLength(32, "At most 32 destinations are allowed."),
            v.check(
                (destinations) =>
                    new Set(destinations.map((d) => d.assetId)).size === destinations.length,
                "At most one destination per asset is allowed.",
            ),
        ),
        /** Least USD value one payout pays, as a decimal; omit or null for no USD minimum. */
        minUsdValue: v.optional(v.nullable(v.string())),
    }),
    v.transform(({ account, minUsdValue, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
        minUsdValueE18:
            minUsdValue == null ? undefined : toU128(decimalToE18("minUsdValue", minUsdValue)),
    })),
);

export type SetAutoWithdrawRuleInput = v.InferInput<typeof SetAutoWithdrawRuleInputSchema>;

export const DisableAutoWithdrawRuleInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        /** The account's latest rule version. */
        expectedVersion: Uint32InputSchema,
    }),
    v.transform(({ account, expectedVersion }) => ({
        subaccountId: accountScopeToSubaccountId(account),
        expectedVersion,
    })),
);

export type DisableAutoWithdrawRuleInput = v.InferInput<typeof DisableAutoWithdrawRuleInputSchema>;

/** `limit` is 0 through 100; 0 or omitted uses the server default of 20. */
export const ListAutoWithdrawRunsInputSchema = v.pipe(
    v.strictObject({
        ...AccountScopeInputEntries,
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), 0),
        pageToken: v.optional(v.pipe(v.string(), v.trim()), ""),
    }),
    v.transform(({ account, ...input }) => ({
        ...input,
        subaccountId: accountScopeToSubaccountId(account),
    })),
);

export type ListAutoWithdrawRunsInput = v.InferInput<typeof ListAutoWithdrawRunsInputSchema>;

type ScheduleShape<Weekday> =
    | { cadence: "hourly"; minuteOfHour: number }
    | { cadence: "daily"; minuteOfDay: number }
    | { cadence: "weekly"; weekday: Weekday; minuteOfDay: number }
    | { cadence: "biweekly"; weekday: Weekday; minuteOfDay: number; anchorDate: string }
    | { cadence: "monthly"; dayOfMonth: number; minuteOfDay: number };

/** A decoded schedule. A cadence this SDK build does not know decodes as `"unspecified"`. */
export type AutoWithdrawSchedule =
    | ScheduleShape<DecodedEnum<AutoWithdrawWeekday>>
    | { cadence: "unspecified" };

const AutoWithdrawScheduleSchema = v.pipe(
    v.object({
        cadence: v.optional(v.number(), 0),
        weekday: v.optional(v.number(), 0),
        minuteOfDay: v.optional(v.number(), 0),
        minuteOfHour: v.optional(v.number(), 0),
        dayOfMonth: v.optional(v.number(), 0),
        anchorDate: v.optional(v.string(), ""),
    }),
    v.transform((s): AutoWithdrawSchedule => {
        const weekday = enumLabel(AutoWithdrawWeekdayCodec.protoToOutput, s.weekday);
        const { minuteOfDay } = s;
        switch (s.cadence) {
            case Proto.AutoWithdrawCadence.HOURLY:
                return { cadence: "hourly", minuteOfHour: s.minuteOfHour };
            case Proto.AutoWithdrawCadence.DAILY:
                return { cadence: "daily", minuteOfDay };
            case Proto.AutoWithdrawCadence.WEEKLY:
                return { cadence: "weekly", weekday, minuteOfDay };
            case Proto.AutoWithdrawCadence.BIWEEKLY:
                return { cadence: "biweekly", weekday, minuteOfDay, anchorDate: s.anchorDate };
            case Proto.AutoWithdrawCadence.MONTHLY:
                return { cadence: "monthly", dayOfMonth: s.dayOfMonth, minuteOfDay };
            default:
                return { cadence: "unspecified" };
        }
    }),
);

function reasonSchema<TReason extends string>() {
    return v.pipe(
        v.optional(v.string(), ""),
        v.transform((reason) => (reason ? (reason as TReason) : null)),
    );
}

const AutoWithdrawDestinationSchema = v.pipe(
    v.object({
        assetId: v.number(),
        destinationChainId: v.bigint(),
        destinationAddress: v.string(),
        minAmountE18: v.optional(U128Schema),
        maxAmountE18: v.optional(U128Schema),
    }),
    v.transform(({ minAmountE18, maxAmountE18, destinationChainId, ...destination }) => ({
        ...destination,
        destinationChainId: Number(destinationChainId),
        minAmount: e18ToDecimal(minAmountE18),
        maxAmount: e18ToDecimal(maxAmountE18),
    })),
);

export type AutoWithdrawDestination = v.InferOutput<typeof AutoWithdrawDestinationSchema>;

const AutoWithdrawPauseSchema = v.object({
    assetId: v.number(),
    reason: v.pipe(
        v.string(),
        v.transform((reason) => reason as AutoWithdrawPauseReason),
    ),
    pausedAt: TimestampMsSchema,
});

export type AutoWithdrawPause = v.InferOutput<typeof AutoWithdrawPauseSchema>;

export const AutoWithdrawRuleSchema = v.pipe(
    v.object({
        subaccountId: v.optional(PublicIdOrEmptySchema, 0n),
        version: v.number(),
        enabled: v.boolean(),
        schedule: v.optional(AutoWithdrawScheduleSchema),
        destinations: v.array(AutoWithdrawDestinationSchema),
        createdAt: TimestampMsSchema,
        pause: v.optional(AutoWithdrawPauseSchema),
        minUsdValueE18: v.optional(U128Schema),
    }),
    v.transform(({ schedule, pause, minUsdValueE18, ...rule }) => ({
        ...rule,
        schedule: schedule ?? ({ cadence: "unspecified" } as AutoWithdrawSchedule),
        pause: pause ?? null,
        minUsdValue: fromU128(minUsdValueE18) === 0n ? null : e18ToDecimal(minUsdValueE18),
    })),
);

/**
 * One version of an account's rule. `subaccountId` is the public subaccount ID, `""` for the
 * root account. Times are epoch milliseconds. `minUsdValue` is null when the rule has no USD
 * minimum; `pause` is set when the rule paused itself, and a new version resumes it.
 */
export type AutoWithdrawRule = v.InferOutput<typeof AutoWithdrawRuleSchema>;

const AutoWithdrawStepSchema = v.pipe(
    v.object({
        assetId: v.number(),
        destinationChainId: v.bigint(),
        destinationAddress: v.string(),
        availableE18: v.optional(U128Schema),
        amountE18: v.optional(U128Schema),
        valueUsdE18: v.optional(U128Schema),
        state: enumLabelSchema(AutoWithdrawStepStateCodec.protoToOutput),
        reason: reasonSchema<AutoWithdrawStepReason>(),
        intentId: v.optional(v.string(), ""),
        txHash: v.optional(v.string(), ""),
    }),
    v.transform(
        ({
            availableE18,
            amountE18,
            valueUsdE18,
            destinationChainId,
            intentId,
            txHash,
            ...step
        }) => ({
            ...step,
            destinationChainId: Number(destinationChainId),
            available: e18ToDecimal(availableE18),
            amount: e18ToDecimal(amountE18),
            valueUsd: valueUsdE18 ? e18ToDecimal(valueUsdE18) : null,
            intentId: intentId || null,
            txHash: txHash || null,
        }),
    ),
);

/**
 * One asset's payout in a run. `available`, `amount` and `valueUsd` are decimal strings;
 * `valueUsd` is null when the rule has no USD minimum or no price was available.
 */
export type AutoWithdrawStep = v.InferOutput<typeof AutoWithdrawStepSchema>;

const AutoWithdrawRunSchema = v.pipe(
    v.object({
        runSeq: BigIntStringSchema,
        ruleVersion: v.number(),
        scheduledFor: TimestampMsSchema,
        state: enumLabelSchema(AutoWithdrawRunStateCodec.protoToOutput),
        reason: reasonSchema<AutoWithdrawRunReason>(),
        steps: v.array(AutoWithdrawStepSchema),
        createdAt: TimestampMsSchema,
        finishedAt: OptionalTimestampMsSchema,
    }),
    v.transform(({ finishedAt, ...run }) => ({ ...run, finishedAt: finishedAt ?? null })),
);

/** One scheduled run. Times are epoch milliseconds; `finishedAt` is null while in progress. */
export type AutoWithdrawRun = v.InferOutput<typeof AutoWithdrawRunSchema>;

export const ListAutoWithdrawRunsResultSchema = v.object({
    runs: v.array(AutoWithdrawRunSchema),
    nextPageToken: v.optional(v.string(), ""),
});

/** One page of runs, newest first. An empty `nextPageToken` means no more runs. */
export type ListAutoWithdrawRunsResult = v.InferOutput<typeof ListAutoWithdrawRunsResultSchema>;
