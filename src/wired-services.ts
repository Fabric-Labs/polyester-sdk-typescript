import type { DescService } from "@bufbuild/protobuf";
import { AddressBookService } from "./gen/auth/v1/address_book_pb.js";
import { ApiKeyService } from "./gen/auth/v1/api_keys_pb.js";
import { AuthService } from "./gen/auth/v1/auth_pb.js";
import { MFAService } from "./gen/auth/v1/mfa_pb.js";
import { PolicyService } from "./gen/auth/v1/policies_pb.js";
import { ProfileService } from "./gen/auth/v1/profile_pb.js";
import { ResolveService } from "./gen/auth/v1/resolve_pb.js";
import { SocialVerificationService } from "./gen/auth/v1/social_verification_pb.js";
import {
    SubaccountRoleService,
    SubaccountService,
    SubaccountViewService,
} from "./gen/auth/v1/subaccounts_pb.js";
import { ChainAnalyticsService } from "./gen/chain/analytics/v1/analytics_read_pb.js";
import { DepositAddressService } from "./gen/chain/deposit/v1/deposit_pb.js";
import { GuardSignerService } from "./gen/chain/guard/v1/guard_signer_pb.js";
import { LifecycleReadService } from "./gen/chain/lifecycle/v1/lifecycle_read_pb.js";
import { WithdrawService } from "./gen/chain/withdraw/v1/withdraw_pb.js";
import { ZipperService } from "./gen/chain/zipper/v1/zipper_pb.js";
import { WhiteboardService } from "./gen/collab/v1/whiteboard_pb.js";
import { FeeService } from "./gen/fees/v1/fees_pb.js";
import { LedgerReadService } from "./gen/ledger/read/v1/ledger_read_pb.js";
import { HeatmapService } from "./gen/marketdata/v1/heatmap_pb.js";
import { MarketDataService } from "./gen/marketdata/v1/marketdata_pb.js";
import { MarketOverviewService } from "./gen/marketoverview/v1/marketoverview_pb.js";
import { OrderbookService } from "./gen/orderbook/v1/orderbook_pb.js";
import { OrdersService } from "./gen/orders/v1/orders_pb.js";
import { OrdersReadService } from "./gen/orders/v1/orders_read_pb.js";
import { RateLimitService } from "./gen/ratelimit/v1/ratelimit_pb.js";
import { InternalTransferService } from "./gen/transfer/v1/internal_transfer_pb.js";
import { TriggersService } from "./gen/triggers/v1/triggers_pb.js";
import { VIPService } from "./gen/vip/v1/vip_pb.js";

/**
 * Every proto service descriptor the SDK's service layer wires a client for.
 * This is the authoritative surface for transport-level mocks: an in-memory
 * transport that routes all of these can serve the whole SDK.
 *
 * Kept in sync mechanically — `wired-services.test.ts` scans every
 * `createClient(...)` call site under `src/services` and `src/realtime` and
 * fails when this list drifts from the code.
 */
export const WIRED_SERVICE_DESCRIPTORS: readonly DescService[] = [
    AddressBookService,
    ApiKeyService,
    AuthService,
    ChainAnalyticsService,
    DepositAddressService,
    FeeService,
    GuardSignerService,
    HeatmapService,
    InternalTransferService,
    LedgerReadService,
    LifecycleReadService,
    MarketDataService,
    MarketOverviewService,
    MFAService,
    OrderbookService,
    OrdersReadService,
    OrdersService,
    PolicyService,
    ProfileService,
    RateLimitService,
    ResolveService,
    SocialVerificationService,
    SubaccountRoleService,
    SubaccountService,
    SubaccountViewService,
    TriggersService,
    VIPService,
    WhiteboardService,
    WithdrawService,
    ZipperService,
];
