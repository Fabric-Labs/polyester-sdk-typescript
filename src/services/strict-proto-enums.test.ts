import { describe, expect, it } from "vitest";
import * as v from "valibot";

import * as AddressBookProto from "../gen/auth/v1/address_book_pb.js";
import * as ApiKeysProto from "../gen/auth/v1/api_keys_pb.js";
import * as MfaProto from "../gen/auth/v1/mfa_pb.js";
import * as SocialProto from "../gen/auth/v1/social_verification_pb.js";
import * as SubaccountsProto from "../gen/auth/v1/subaccounts_pb.js";
import * as LifecycleProto from "../gen/chain/lifecycle/v1/types_pb.js";
import * as WhiteboardProto from "../gen/collab/v1/whiteboard_pb.js";
import * as LedgerReadProto from "../gen/ledger/read/v1/ledger_read_pb.js";
import * as HeatmapProto from "../gen/marketdata/v1/heatmap_pb.js";
import * as MarketDataProto from "../gen/marketdata/v1/marketdata_pb.js";
import * as OrdersProto from "../gen/orders/v1/orders_pb.js";
import * as RateLimitProto from "../gen/ratelimit/v1/ratelimit_pb.js";
import { requiredEnumLabel } from "../shared/proto-enum-codec.js";
import {
    AddressBookEntryKindCodec,
    DestinationWhitelistStatusCodec,
} from "./address-book/address-book.codecs.js";
import { ApiKeySchema } from "./api-keys/api-keys.schemas.js";
import { createBalanceHistoryResponseSchema } from "./balances/balances.schemas.js";
import { createCandleRowSchema } from "./candles/candles.schemas.js";
import { createCatalogSdkScales } from "../shared/decimal-surface.js";
import { createTestCatalog } from "../testing/catalog.js";
import { createOrderbookHeatmapResponseSchema } from "./heatmap/heatmap.schemas.js";
import { createLifecycleRequestFeeSchema } from "./lifecycle/lifecycle.schemas.js";
import { BeginMfaChallengeResultSchema } from "./mfa/mfa.schemas.js";
import { ModifyOrderResultSchema } from "./orders/orders.schemas.js";
import { transformVerification } from "./social-verification/social-verification.schemas.js";
import {
    SubaccountActivityEventSchema,
    SubaccountInviteSchema,
    SubaccountSchema,
} from "./subaccounts/subaccounts.schemas.js";
import { TradingRateLimitRuleSchema } from "./rate-limits/rate-limits.schemas.js";
import { WhiteboardAccessSchema } from "./whiteboard/whiteboard.schemas.js";

const timestamp = { seconds: 0n, nanos: 0 };
const testScales = createCatalogSdkScales(() =>
    createTestCatalog({
        assets: [
            {
                symbol: "BTC",
                ledgerId: 1,
                name: "Bitcoin",
                quantityDisplayDecimals: 5,
                quantityScale: 8,
            },
            {
                symbol: "USDT",
                ledgerId: 2,
                name: "Tether",
                quantityDisplayDecimals: 2,
                quantityScale: 6,
            },
        ],
        pairs: [
            {
                symbolId: 1,
                symbol: "BTC-USDT",
                baseAsset: "BTC",
                quoteAsset: "USDT",
                tickSize: "0.01",
                stepSize: "0.0001",
                minNotionalQuote: "10",
                minQtyBase: "0.0001",
                allowBuyFeeFromBase: false,
                defaultMarketSlippagePctBuy: 1,
                defaultMarketSlippagePctSell: 1,
                maxClientRefDriftPct: 1,
                baseQuantityScale: 8,
                quoteQuantityScale: 6,
                status: "enabled",
            },
        ],
    }),
);
const BalanceHistoryResponseSchema = createBalanceHistoryResponseSchema();
const LifecycleRequestFeeSchema = createLifecycleRequestFeeSchema();
const CandleRowSchema = createCandleRowSchema(testScales);
const OrderbookHeatmapResponseSchema = createOrderbookHeatmapResponseSchema(testScales);

function kindFromProto(kind: AddressBookProto.AddressBookEntryKind) {
    return requiredEnumLabel(
        AddressBookEntryKindCodec.protoToOutput,
        kind,
        "PolyesterClient.AddressBookEntryKindSchema",
        "entry kind",
    );
}

function whitelistStatusFromProto(status: AddressBookProto.DestinationWhitelistStatus) {
    return requiredEnumLabel(
        DestinationWhitelistStatusCodec.protoToOutput,
        status,
        "PolyesterClient.DestinationWhitelistStatusSchema",
        "whitelist status",
    );
}

describe("proto enum output decoding", () => {
    it("preserves subaccount role and invite status sent as unspecified", () => {
        expect(
            v.parse(SubaccountSchema, {
                id: 1n,
                role: SubaccountsProto.SubaccountRole.SUBACCOUNT_ROLE_UNSPECIFIED,
                status: "active",
                smartAccountAddress: "0xabc",
                ownerRootSmartAccountAddress: "0xabc",
                subaccountPolicyId: 1n,
                revision: 1n,
            }),
        ).toMatchObject({ role: "unspecified" });

        expect(
            v.parse(SubaccountInviteSchema, {
                id: 1n,
                subaccountId: 1n,
                granteeAccountId: 1n,
                inviterAccountId: 1n,
                role: SubaccountsProto.SubaccountRole.VIEWER,
                status: SubaccountsProto.SubaccountInviteStatus.UNSPECIFIED,
                inviterRootSmartAccountAddress: "0xabc",
                granteeRootSmartAccountAddress: "0xdef",
                requireMemberMfa: false,
                revision: 1n,
            }),
        ).toMatchObject({ status: "unspecified" });
    });

    it("preserves unspecified subaccount activity enums", () => {
        expect(
            v.parse(SubaccountActivityEventSchema, {
                entityKind: SubaccountsProto.ActivityEntityKind.ACTIVITY_ENTITY_UNSPECIFIED,
                eventAction: SubaccountsProto.ActivityEventAction.ACTIVITY_ACTION_CREATED,
                source: SubaccountsProto.ActivityEventSource.ACTIVITY_SOURCE_WEB,
                actorAccountId: 1n,
                payloadJson: "{}",
            }),
        ).toMatchObject({ entityKind: "unspecified" });
    });

    it("preserves address-book helper enums sent as unspecified", () => {
        expect(kindFromProto(AddressBookProto.AddressBookEntryKind.ENTRY_KIND_UNSPECIFIED)).toBe(
            "unspecified",
        );
        expect(
            whitelistStatusFromProto(
                AddressBookProto.DestinationWhitelistStatus
                    .DESTINATION_WHITELIST_STATUS_UNSPECIFIED,
            ),
        ).toBe("unspecified");
    });

    it("preserves whiteboard roles sent as unspecified", () => {
        expect(
            v.parse(WhiteboardAccessSchema, {
                role: WhiteboardProto.BoardRole.ROLE_UNSPECIFIED,
            }),
        ).toEqual({ role: "unspecified" });
    });

    it("preserves social verification enums sent as unspecified", () => {
        expect(
            transformVerification({
                id: 1n,
                provider: SocialProto.SocialProvider.PROVIDER_UNSPECIFIED,
                method: SocialProto.SocialVerificationMethod.METHOD_PROFILE,
                handle: "alice",
                providerUserId: "alice-id",
                challengeCode: "code",
                status: SocialProto.SocialVerificationStatus.STATUS_PENDING_USER_ACTION,
                attempts: 0,
                lastError: "",
            } as SocialProto.SocialVerification),
        ).toMatchObject({ provider: "unspecified" });
    });

    it("preserves order result enums sent as unspecified", () => {
        expect(
            v.parse(ModifyOrderResultSchema, {
                actionTaken: OrdersProto.ModifyActionTaken.MODIFY_ACTION_UNSPECIFIED,
                oldOrderId: 1n,
                finalOrderId: 1n,
                code: "",
                tsNs: 0n,
            }),
        ).toMatchObject({ actionTaken: "unspecified" });
    });

    it("preserves balance, lifecycle, candle, heatmap, api-key, and MFA response enums sent as unspecified", () => {
        expect(
            v.parse(BalanceHistoryResponseSchema, {
                range: LedgerReadProto.BalanceRange.RANGE_UNSPECIFIED,
                bucket: "1d",
                startTsSec: 0,
                endTsSec: 0,
                points: 0,
                series: [],
            }),
        ).toMatchObject({ range: "unspecified" });

        expect(
            v.parse(LifecycleRequestFeeSchema, {
                recipientAddress: "0xabc",
                status: LifecycleProto.RequestFeeStatus.UNSPECIFIED,
            }),
        ).toMatchObject({ status: "unspecified" });

        expect(
            v.parse(CandleRowSchema, {
                symbolId: 1,
                timeframe: MarketDataProto.Timeframe.TIMEFRAME_UNSPECIFIED,
                tsSec: 0n,
                open: 0n,
                high: 0n,
                low: 0n,
                close: 0n,
                volume: 0n,
            }),
        ).toMatchObject({ timeframe: "unspecified" });

        expect(
            v.parse(OrderbookHeatmapResponseSchema, {
                symbolId: 1,
                interval: HeatmapProto.HeatmapInterval.INTERVAL_UNSPECIFIED,
                depth: HeatmapProto.HeatmapDepth.DEPTH_50,
                lastPersistedTsSec: 0n,
                liveFromBookSeqEnd: 0n,
                hasLiveAnchor: false,
                nextPageToken: "",
                serverTimeSec: 0n,
                quantityMode: HeatmapProto.HeatmapQuantityMode.CLOSE,
            }),
        ).toMatchObject({ interval: "unspecified" });

        expect(
            v.parse(ApiKeySchema, {
                keyId: "key-1",
                createdAt: timestamp,
                publicKeyEd25519: new Uint8Array([1]),
                status: ApiKeysProto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED,
                createdByActor: "tester",
                revision: 1n,
            }),
        ).toMatchObject({ status: "unspecified" });

        expect(
            v.parse(BeginMfaChallengeResultSchema, {
                challengeId: "challenge-1",
                allowedFactorTypes: [MfaProto.MFAFactorType.MFA_FACTOR_TYPE_UNSPECIFIED],
            }),
        ).toMatchObject({ allowedFactorTypes: ["unspecified"] });
    });

    it("preserves unspecified trading rate-limit policy class", () => {
        expect(
            v.parse(TradingRateLimitRuleSchema, {
                policyClass: RateLimitProto.TradingRateLimitClass.UNSPECIFIED,
                vipTier: 0,
                quotaWeight: 0n,
                periodMs: 1000n,
                burstWeight: 0n,
            }),
        ).toMatchObject({ policyClass: "unspecified" });
    });

    it("still rejects truly unknown nonzero enum values", () => {
        expect(() => kindFromProto(999 as AddressBookProto.AddressBookEntryKind)).toThrow(
            "invalid entry kind 999",
        );
        expect(() =>
            v.parse(WhiteboardAccessSchema, {
                role: 999 as WhiteboardProto.BoardRole,
            }),
        ).toThrow(/received 999/);
    });
});
