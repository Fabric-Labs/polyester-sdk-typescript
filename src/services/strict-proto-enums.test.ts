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
import * as TriggersProto from "../gen/triggers/v1/triggers_pb.js";
import { requiredEnumLabel } from "../shared/proto-enum-codec.js";
import {
    AddressBookEntryKindCodec,
    DestinationWhitelistStatusCodec,
} from "./address-book/address-book.codecs.js";
import { ApiKeySchema } from "./api-keys/api-keys.schemas.js";
import { BalanceHistoryResponseSchema } from "./balances/balances.schemas.js";
import { CandleRowSchema } from "./candles/candles.schemas.js";
import { OrderbookHeatmapResponseSchema } from "./heatmap/heatmap.schemas.js";
import { LifecycleRequestFeeSchema } from "./lifecycle/lifecycle.schemas.js";
import { BeginMfaChallengeResultSchema } from "./mfa/mfa.schemas.js";
import { ModifyOrderResultSchema } from "./orders/orders.schemas.js";
import { transformVerification } from "./social-verification/social-verification.schemas.js";
import { SubaccountInviteSchema, SubaccountSchema } from "./subaccounts/subaccounts.schemas.js";
import { CreateTriggerResultSchema } from "./triggers/triggers.schemas.js";
import { WhiteboardAccessSchema } from "./whiteboard/whiteboard.schemas.js";

const timestamp = { seconds: 0n, nanos: 0 };

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

describe("strict proto enum output decoding", () => {
    it("rejects subaccount role and invite status sent as unspecified", () => {
        expect(() =>
            v.parse(SubaccountSchema, {
                id: 1n,
                role: SubaccountsProto.SubaccountRole.SUBACCOUNT_ROLE_UNSPECIFIED,
                status: "active",
                smartAccountAddress: "0xabc",
                ownerRootSmartAccountAddress: "0xabc",
                subaccountPolicyId: 1n,
            }),
        ).toThrow("invalid role 0");

        expect(() =>
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
            }),
        ).toThrow("invalid status 0");
    });

    it("rejects address-book helper enums sent as unspecified", () => {
        expect(() =>
            kindFromProto(AddressBookProto.AddressBookEntryKind.ENTRY_KIND_UNSPECIFIED),
        ).toThrow("invalid entry kind 0");
        expect(() =>
            whitelistStatusFromProto(
                AddressBookProto.DestinationWhitelistStatus
                    .DESTINATION_WHITELIST_STATUS_UNSPECIFIED,
            ),
        ).toThrow("invalid whitelist status 0");
    });

    it("rejects whiteboard roles sent as unspecified", () => {
        expect(() =>
            v.parse(WhiteboardAccessSchema, {
                role: WhiteboardProto.BoardRole.ROLE_UNSPECIFIED,
            }),
        ).toThrow("invalid role 0");
    });

    it("rejects social verification enums sent as unspecified", () => {
        expect(() =>
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
        ).toThrow("invalid provider 0");
    });

    it("rejects order and trigger result enums sent as unspecified", () => {
        expect(() =>
            v.parse(ModifyOrderResultSchema, {
                actionTaken: OrdersProto.ModifyActionTaken.MODIFY_ACTION_UNSPECIFIED,
                oldOrderId: 1n,
                finalOrderId: 1n,
                code: "",
                tsNs: 0n,
            }),
        ).toThrow("invalid action taken 0");

        expect(() =>
            v.parse(CreateTriggerResultSchema, {
                triggerId: 1n,
                status: TriggersProto.TriggerStatus.TRIGGER_STATUS_UNSPECIFIED,
                tsNs: 0n,
                clientTriggerId: "trigger-1",
            }),
        ).toThrow("invalid status 0");
    });

    it("rejects balance, lifecycle, candle, heatmap, api-key, and MFA response enums sent as unspecified", () => {
        expect(() =>
            v.parse(BalanceHistoryResponseSchema, {
                range: LedgerReadProto.BalanceRange.BALANCE_RANGE_UNSPECIFIED,
                bucket: "1d",
                startTsSec: 0,
                endTsSec: 0,
                points: 0,
                series: [],
            }),
        ).toThrow("invalid range 0");

        expect(() =>
            v.parse(LifecycleRequestFeeSchema, {
                recipientAddress: "0xabc",
                status: LifecycleProto.RequestFeeStatus.UNSPECIFIED,
            }),
        ).toThrow("invalid request fee status 0");

        expect(() =>
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
        ).toThrow("invalid timeframe 0");

        expect(() =>
            v.parse(OrderbookHeatmapResponseSchema, {
                symbolId: 1,
                interval: HeatmapProto.HeatmapInterval.INTERVAL_UNSPECIFIED,
                depth: HeatmapProto.HeatmapDepth.DEPTH_50,
                lastPersistedTsSec: 0n,
                liveFromBookSeqEnd: 0n,
                hasLiveAnchor: false,
                hasMore: false,
                nextTsSec: 0n,
                serverTimeSec: 0n,
                quantityMode: HeatmapProto.HeatmapQuantityMode.CLOSE,
            }),
        ).toThrow("invalid interval 0");

        expect(() =>
            v.parse(ApiKeySchema, {
                keyId: "key-1",
                createdAt: timestamp,
                publicKeyEd25519: new Uint8Array([1]),
                status: ApiKeysProto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED,
                createdByActor: "tester",
            }),
        ).toThrow("invalid status 0");

        expect(() =>
            v.parse(BeginMfaChallengeResultSchema, {
                challengeId: "challenge-1",
                allowedFactorTypes: [MfaProto.MFAFactorType.MFA_FACTOR_TYPE_UNSPECIFIED],
            }),
        ).toThrow("invalid allowed factor type 0");
    });
});
