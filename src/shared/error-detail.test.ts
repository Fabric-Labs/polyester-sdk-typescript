import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { AuthErrorCode, AuthErrorDetailSchema } from "../gen/auth/v1/auth_pb.js";
import { ProfileErrorCode, ProfileErrorDetailSchema } from "../gen/auth/v1/profile_pb.js";
import {
    ErrorCode as WithdrawErrorCode,
    ErrorDetailSchema as WithdrawErrorDetailSchema,
} from "../gen/chain/withdraw/v1/withdraw_pb.js";
import {
    ErrorCode as LedgerErrorCode,
    ErrorDetailSchema as LedgerErrorDetailSchema,
} from "../gen/ledger/read/v1/ledger_read_pb.js";
import {
    ErrorCode as MarketOverviewErrorCode,
    ErrorDetailSchema as MarketOverviewErrorDetailSchema,
} from "../gen/marketoverview/v1/marketoverview_pb.js";
import {
    ErrorCode as OrderErrorCode,
    ErrorDetailSchema as OrderErrorDetailSchema,
} from "../gen/orders/v1/orders_pb.js";
import {
    FailureReason,
    LimiterScope,
    PolicyClass,
    RefillModel,
} from "../gen/polyester/ratelimit/v1/types_pb.js";
import {
    ErrorCode as InternalTransferErrorCode,
    ErrorDetailSchema as InternalTransferErrorDetailSchema,
} from "../gen/transfer/v1/internal_transfer_pb.js";
import { parseConnectErrorDetail } from "./error-detail.js";

function error(details: ConnectError["details"]): ConnectError {
    const result = new ConnectError("rejected", Code.InvalidArgument);
    result.details = details;
    return result;
}

describe("parseConnectErrorDetail", () => {
    it("returns typed details for every backend service", () => {
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: AuthErrorDetailSchema,
                        value: create(AuthErrorDetailSchema, {
                            code: AuthErrorCode.AUTH_USERNAME_TAKEN,
                            message: "taken",
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "auth", code: "AUTH_USERNAME_TAKEN", message: "taken" });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: ProfileErrorDetailSchema,
                        value: create(ProfileErrorDetailSchema, {
                            code: ProfileErrorCode.PROFILE_INVALID_FIELD,
                            field: "bio",
                            message: "bad bio",
                        }),
                    },
                ]),
            ),
        ).toEqual({
            service: "profile",
            code: "PROFILE_INVALID_FIELD",
            field: "bio",
            message: "bad bio",
        });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: OrderErrorDetailSchema,
                        value: create(OrderErrorDetailSchema, {
                            code: OrderErrorCode.STALE_QUOTE,
                            violations: [
                                {
                                    fieldPath: "price",
                                    ruleId: "positive",
                                    message: "must be positive",
                                },
                            ],
                            rateLimit: {
                                reason: FailureReason.QUOTA_EXCEEDED,
                                limit: 100n,
                                remaining: 0n,
                                retryAfterMs: 1_500n,
                                policyVersion: 7n,
                                operationId: "orders.create",
                                policyClass: PolicyClass.TRADING_PLACE,
                                scope: LimiterScope.SUBACCOUNT,
                                refillModel: RefillModel.ROLLING_WINDOW,
                            },
                        }),
                    },
                ]),
            ),
        ).toEqual({
            service: "orders",
            code: "STALE_QUOTE",
            violations: [{ fieldPath: "price", ruleId: "positive", message: "must be positive" }],
            rateLimit: {
                reason: "quota_exceeded",
                limit: "100",
                remaining: "0",
                retryAfterMs: "1500",
                policyVersion: "7",
                operationId: "orders.create",
                policyClass: "trading_place",
                scope: "subaccount",
                refillModel: "rolling_window",
            },
        });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: WithdrawErrorDetailSchema,
                        value: create(WithdrawErrorDetailSchema, {
                            code: WithdrawErrorCode.AMOUNT_BELOW_MINIMUM,
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "withdraw", code: "AMOUNT_BELOW_MINIMUM" });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: InternalTransferErrorDetailSchema,
                        value: create(InternalTransferErrorDetailSchema, {
                            code: InternalTransferErrorCode.DESTINATION_NOT_WHITELISTED,
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "internal_transfer", code: "DESTINATION_NOT_WHITELISTED" });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: LedgerErrorDetailSchema,
                        value: create(LedgerErrorDetailSchema, {
                            code: LedgerErrorCode.UPSTREAM_ERROR,
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "ledger", code: "UPSTREAM_ERROR" });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: MarketOverviewErrorDetailSchema,
                        value: create(MarketOverviewErrorDetailSchema, {
                            code: MarketOverviewErrorCode.UPSTREAM_ERROR,
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "market_overview", code: "UPSTREAM_ERROR" });
    });

    it("decodes wire details and skips invalid wire payloads", () => {
        const valid = {
            type: WithdrawErrorDetailSchema.typeName,
            value: toBinary(
                WithdrawErrorDetailSchema,
                create(WithdrawErrorDetailSchema, {
                    code: WithdrawErrorCode.AMOUNT_BELOW_MINIMUM,
                }),
            ),
        };
        expect(
            parseConnectErrorDetail(
                error([
                    { type: WithdrawErrorDetailSchema.typeName, value: new Uint8Array([0xff]) },
                    { type: "unknown.ErrorDetail", value: new Uint8Array() },
                    valid,
                ]),
            ),
        ).toEqual({ service: "withdraw", code: "AMOUNT_BELOW_MINIMUM" });
    });

    it("skips malformed details and preserves the first valid wire detail", () => {
        const malformedOrder = create(OrderErrorDetailSchema, {
            code: OrderErrorCode.STALE_QUOTE,
            violations: [{ fieldPath: "price", ruleId: "positive", message: 1 as never }],
        });
        expect(
            parseConnectErrorDetail(
                error([
                    { desc: OrderErrorDetailSchema, value: malformedOrder },
                    {
                        desc: WithdrawErrorDetailSchema,
                        value: create(WithdrawErrorDetailSchema, {
                            code: WithdrawErrorCode.AMOUNT_BELOW_MINIMUM,
                        }),
                    },
                    {
                        desc: InternalTransferErrorDetailSchema,
                        value: create(InternalTransferErrorDetailSchema, {
                            code: InternalTransferErrorCode.DESTINATION_NOT_WHITELISTED,
                        }),
                    },
                ]),
            ),
        ).toEqual({ service: "withdraw", code: "AMOUNT_BELOW_MINIMUM" });
        expect(
            parseConnectErrorDetail(
                error([
                    {
                        desc: WithdrawErrorDetailSchema,
                        value: create(WithdrawErrorDetailSchema, {
                            code: 999 as WithdrawErrorCode,
                        }),
                    },
                ]),
            ),
        ).toBeUndefined();
    });
});
