import * as Proto from "../../gen/auth/v1/api_keys_pb.js";
import type { InputToProto, ProtoToOutput } from "../../utils/types.js";

export const API_KEY_STATUS_VALUES = ["active", "revoked", "disabled"] as const;
export type ApiKeyStatusLabel = (typeof API_KEY_STATUS_VALUES)[number];
export const API_KEY_UPDATE_STATUS_VALUES = ["active", "disabled"] as const;
export type ApiKeyUpdateStatusLabel = (typeof API_KEY_UPDATE_STATUS_VALUES)[number];
export const API_KEY_PURPOSE_VALUES = ["standard", "assistant", "admin", "strategy_bot"] as const;
export type ApiKeyPurposeLabel = (typeof API_KEY_PURPOSE_VALUES)[number];
/** Purposes a key can be created with or switched to; assistant keys come from `setAssistantKeys`. */
export const API_KEY_PURPOSE_INPUT_VALUES = ["standard", "admin"] as const;
export type ApiKeyPurposeInput = (typeof API_KEY_PURPOSE_INPUT_VALUES)[number];

/**
 * Fixed permission sets for an assistant key, available on devnet only. `read_only` reads
 * balances, orders, transfers, auto-withdraw rules, API keys, subaccounts, deposit addresses
 * and account statements (and price alerts on the main account). `trade_with_approval` adds trading, swaps and deposit
 * address creation, each trade only after the user approves it (and price alert management on
 * the main account). No preset moves value out of the account.
 */
export const ASSISTANT_KEY_PRESET_VALUES = ["read_only", "trade_with_approval"] as const;
export type AssistantKeyPreset = (typeof ASSISTANT_KEY_PRESET_VALUES)[number];

export const AssistantKeyPresetCodec = {
    inputToProto: {
        read_only: Proto.AssistantKeyPreset.READ_ONLY,
        trade_with_approval: Proto.AssistantKeyPreset.TRADE_WITH_APPROVAL,
    } satisfies InputToProto<AssistantKeyPreset, Proto.AssistantKeyPreset>,
    protoToOutput: {
        [Proto.AssistantKeyPreset.PRESET_UNSPECIFIED]: "unspecified",
        [Proto.AssistantKeyPreset.READ_ONLY]: "read_only",
        [Proto.AssistantKeyPreset.TRADE_WITH_APPROVAL]: "trade_with_approval",
    } satisfies ProtoToOutput<Proto.AssistantKeyPreset, AssistantKeyPreset>,
} as const;

/**
 * `assistant` keys belong to the Polyester AI assistant: their policy can never move value out
 * of the account. They are listed, updated and revoked like any key. `admin` keys are elevated:
 * their policy's admin permissions let them manage the main account's other keys and its
 * sub-account policies without a session. Only the owner's session with a fresh step-up proof
 * can create, promote, change or delete one. A `strategy_bot` key trades for one strategy bot
 * (`strategyBotId`) on its own sub-account: no call changes, revokes or re-binds it while the bot
 * holds it (`AUTH_STRATEGY_BOT_MANAGED`).
 */
export const ApiKeyPurposeCodec = {
    inputToProto: {
        standard: Proto.ApiKeyPurpose.STANDARD,
        admin: Proto.ApiKeyPurpose.ADMIN_KEY,
    } satisfies InputToProto<ApiKeyPurposeInput, Proto.ApiKeyPurpose>,
    protoToOutput: {
        [Proto.ApiKeyPurpose.PURPOSE_UNSPECIFIED]: "unspecified",
        [Proto.ApiKeyPurpose.STANDARD]: "standard",
        [Proto.ApiKeyPurpose.ASSISTANT]: "assistant",
        [Proto.ApiKeyPurpose.ADMIN_KEY]: "admin",
        [Proto.ApiKeyPurpose.STRATEGY_BOT]: "strategy_bot",
    } satisfies ProtoToOutput<Proto.ApiKeyPurpose, ApiKeyPurposeLabel>,
} as const;

export const ApiKeyStatusCodec = {
    inputToProto: {
        active: Proto.ApiKeyStatus.ACTIVE,
        disabled: Proto.ApiKeyStatus.DISABLED,
    } satisfies InputToProto<ApiKeyUpdateStatusLabel, Proto.ApiKeyStatus>,
    protoToOutput: {
        [Proto.ApiKeyStatus.API_KEY_STATUS_UNSPECIFIED]: "unspecified",
        [Proto.ApiKeyStatus.ACTIVE]: "active",
        [Proto.ApiKeyStatus.REVOKED]: "revoked",
        [Proto.ApiKeyStatus.DISABLED]: "disabled",
    } satisfies ProtoToOutput<Proto.ApiKeyStatus, ApiKeyStatusLabel>,
} as const;
