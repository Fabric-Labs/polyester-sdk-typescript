import { ValidationError } from "../../shared/errors.js";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import type { Address, Hex } from "viem";
import {
    checksumEvmAddress,
    evmHexToBytes,
    evmUtf8ToBytes,
    keccak256Hex,
} from "../../utils/evm.js";
import type { ClientCatalog } from "../../catalogs/types.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import * as v from "valibot";
import {
    createCreateTradingWithdrawToExternalChainInputSchema,
    createCreateTradingWithdrawToFundingInputSchema,
    CreateTradingWithdrawResultSchema,
    CreateWalletTradingWithdrawResultSchema,
    type CreateTradingWithdrawResult,
    type CreateTradingWithdrawToExternalChainInput,
    type CreateTradingWithdrawToExternalChainRequest,
    type CreateTradingWithdrawToFundingInput,
    type CreateTradingWithdrawToFundingRequest,
    type TradingWithdrawIntentPayloadRequest,
} from "./trading-withdraws.schemas.js";

export type TradingWithdrawWalletTypedData = ReturnType<typeof buildTradingWithdrawWalletTypedData>;

export type TradingWithdrawWalletSigner = {
    signerWallet: string;
    accountId: string;
    signTypedData: (typedData: TradingWithdrawWalletTypedData) => Promise<Hex>;
};

export type TradingWithdrawSigningConfig = {
    chainId: number;
    tradingGatewayAddress: Address;
};

export type CreateTradingWithdrawToFundingServiceInput = CreateTradingWithdrawToFundingInput & {
    walletSigner?: TradingWithdrawWalletSigner;
};

export type CreateTradingWithdrawToExternalChainServiceInput =
    CreateTradingWithdrawToExternalChainInput & {
        walletSigner?: TradingWithdrawWalletSigner;
    };

export type PreparedTradingWithdraw = Readonly<{
    /**
     * Submits the exact payload and signature produced during preparation.
     * Repeated calls only change transport options such as the step-up token.
     */
    submit: (options?: PolyesterMutationOptions) => Promise<CreateTradingWithdrawResult>;
}>;

type TradingWithdrawRequest =
    | CreateTradingWithdrawToFundingRequest
    | CreateTradingWithdrawToExternalChainRequest;

function fromU128(value: TradingWithdrawIntentPayloadRequest["amountE18"] | undefined): bigint {
    if (!value) return 0n;
    return (value.hi << 64n) + value.lo;
}

function resolveTradingWithdrawTargetAccountId(params: {
    subaccountId: bigint | undefined;
    rootAccountId: string;
}): bigint {
    if (params.subaccountId !== undefined) return params.subaccountId;
    return idToBigInt(params.rootAccountId, "targetAccountId");
}

async function resolveTradingWithdrawSigningConfig(params: {
    fallback: TradingWithdrawSigningConfig;
    catalog?: ClientCatalog;
}): Promise<TradingWithdrawSigningConfig> {
    if (!params.catalog) return params.fallback;

    try {
        await params.catalog.ensureReady();
        const gateway = params.catalog.zipper.getContractByName("tradingGateway");
        const address = gateway?.address?.trim();
        if (!address?.startsWith("0x")) return params.fallback;

        return {
            chainId: params.fallback.chainId,
            tradingGatewayAddress: checksumEvmAddress(address),
        };
    } catch {
        return params.fallback;
    }
}

function buildTradingWithdrawWalletTypedData(params: {
    signingConfig: TradingWithdrawSigningConfig;
    payload: TradingWithdrawIntentPayloadRequest;
    signerWallet: Address;
    accountId: bigint;
    targetAccountId: bigint;
}) {
    const payload = params.payload;
    const destinationAddress = (payload.destinationAddress ?? "").trim();
    const idempotencyKey = payload.idempotencyKey.trim();

    return {
        domain: {
            name: "Polyester Trading Withdraw",
            version: "1",
            chainId: params.signingConfig.chainId,
            verifyingContract: params.signingConfig.tradingGatewayAddress,
        },
        types: {
            WalletTradingWithdraw: [
                { name: "signerWallet", type: "address" },
                { name: "actionType", type: "uint8" },
                { name: "accountId", type: "uint64" },
                { name: "targetAccountId", type: "uint64" },
                { name: "assetId", type: "uint32" },
                { name: "destinationChainId", type: "uint64" },
                { name: "amountQ", type: "uint128" },
                { name: "destinationHash", type: "bytes32" },
                { name: "deadlineTsSec", type: "uint256" },
                { name: "nonce", type: "uint128" },
                { name: "idempotencyKeyHash", type: "bytes32" },
            ],
        },
        primaryType: "WalletTradingWithdraw",
        message: {
            signerWallet: params.signerWallet,
            actionType: payload.action,
            accountId: params.accountId,
            targetAccountId: params.targetAccountId,
            assetId: payload.assetId,
            destinationChainId: payload.destinationChainId ?? 0n,
            amountQ: fromU128(payload.amountE18),
            destinationHash: keccak256Hex(evmUtf8ToBytes(destinationAddress)),
            deadlineTsSec: payload.deadlineTsSec,
            nonce: fromU128(payload.nonce),
            idempotencyKeyHash: keccak256Hex(evmUtf8ToBytes(idempotencyKey)),
        },
    } as const;
}

async function resolveWalletSignature(params: {
    signingConfig: TradingWithdrawSigningConfig;
    payload: TradingWithdrawIntentPayloadRequest;
    walletSigner: TradingWithdrawWalletSigner;
    targetAccountId: bigint;
}): Promise<{ signerWallet: string; payloadSignature: Uint8Array }> {
    const signerWallet = params.walletSigner.signerWallet.trim();
    if (!signerWallet.startsWith("0x")) {
        throw new ValidationError("Trading withdraw signer wallet is required.");
    }
    const accountId = idToBigInt(params.walletSigner.accountId, "accountId");
    const signature = await params.walletSigner.signTypedData(
        buildTradingWithdrawWalletTypedData({
            signingConfig: params.signingConfig,
            payload: params.payload,
            signerWallet: signerWallet as Address,
            accountId,
            targetAccountId: params.targetAccountId,
        }),
    );
    return {
        signerWallet,
        payloadSignature: evmHexToBytes(signature),
    };
}

/**
 * Creates durable Trading withdrawal intents to Funding using API signatures or wallet EIP-712 signatures.
 */
export class TradingWithdrawsService {
    #client: Client<typeof Proto.WithdrawService>;
    #resolver?: SubaccountResolver;
    #signingConfig: TradingWithdrawSigningConfig;
    #catalog?: ClientCatalog;
    #scales: SdkScales;
    #toFundingInputSchema: ReturnType<typeof createCreateTradingWithdrawToFundingInputSchema>;
    #toExternalChainInputSchema: ReturnType<
        typeof createCreateTradingWithdrawToExternalChainInputSchema
    >;

    constructor(
        transport: Transport,
        resolver: SubaccountResolver | undefined,
        signingConfig: TradingWithdrawSigningConfig,
        scales: SdkScales,
        catalog?: ClientCatalog,
    ) {
        this.#client = createClient(Proto.WithdrawService, transport);
        this.#resolver = resolver;
        this.#signingConfig = signingConfig;
        this.#catalog = catalog;
        this.#scales = scales;
        this.#toFundingInputSchema = createCreateTradingWithdrawToFundingInputSchema(scales);
        this.#toExternalChainInputSchema =
            createCreateTradingWithdrawToExternalChainInputSchema(scales);
    }

    /**
     * Builds a Trading-to-Funding withdraw intent payload with asset id, decimal amount, destination address, five-minute deadline, nonce, and idempotency key. If a wallet signer is provided, it signs EIP-712 typed data and calls the wallet endpoint; otherwise a payload signature is required for the backend-authorized endpoint.
     */
    async createToFunding(
        input: CreateTradingWithdrawToFundingServiceInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateTradingWithdrawResult> {
        const prepared = await this.prepareToFunding(input);
        return prepared.submit(options);
    }

    /**
     * Builds and signs a Trading-to-Funding withdrawal once so the exact request can be
     * resubmitted after backend-directed authorization such as MFA step-up.
     */
    async prepareToFunding(
        input: CreateTradingWithdrawToFundingServiceInput,
    ): Promise<PreparedTradingWithdraw> {
        await this.#scales.ready();
        const { walletSigner, ...inputForValidation } = input;
        const resolvedInput = resolveAccountScopedInput(inputForValidation, this.#resolver);
        const validated = v.parse(this.#toFundingInputSchema, resolvedInput);
        return this.#prepareWithdraw(validated, walletSigner);
    }

    /**
     * Builds a Trading-to-external-chain withdraw intent payload with asset id, decimal gross amount, destination network, destination address, five-minute deadline, nonce, and idempotency key. If a wallet signer is provided, it signs EIP-712 typed data and calls the wallet endpoint; otherwise a payload signature is required for the backend-authorized endpoint.
     */
    async createToExternalChain(
        input: CreateTradingWithdrawToExternalChainServiceInput,
        options?: PolyesterMutationOptions,
    ): Promise<CreateTradingWithdrawResult> {
        const prepared = await this.prepareToExternalChain(input);
        return prepared.submit(options);
    }

    /**
     * Builds and signs a Trading-to-external-chain withdrawal once so the exact request can
     * be resubmitted after backend-directed authorization such as MFA step-up.
     */
    async prepareToExternalChain(
        input: CreateTradingWithdrawToExternalChainServiceInput,
    ): Promise<PreparedTradingWithdraw> {
        await this.#scales.ready();
        const { walletSigner, ...inputForValidation } = input;
        const resolvedInput = resolveAccountScopedInput(inputForValidation, this.#resolver);
        const validated = v.parse(this.#toExternalChainInputSchema, resolvedInput);
        return this.#prepareWithdraw(validated, walletSigner);
    }

    async #prepareWithdraw(
        validated: TradingWithdrawRequest,
        walletSigner: TradingWithdrawWalletSigner | undefined,
    ): Promise<PreparedTradingWithdraw> {
        if (walletSigner) {
            const signingConfig = await resolveTradingWithdrawSigningConfig({
                fallback: this.#signingConfig,
                catalog: this.#catalog,
            });
            const targetAccountId = resolveTradingWithdrawTargetAccountId({
                subaccountId: validated.subaccountId,
                rootAccountId: walletSigner.accountId,
            });

            const walletSignature = await resolveWalletSignature({
                signingConfig,
                payload: validated.payload,
                walletSigner,
                targetAccountId,
            });
            const request = removeUndefined({
                payload: validated.payload,
                subaccountId: validated.subaccountId,
                signerWallet: walletSignature.signerWallet,
                payloadSignature: walletSignature.payloadSignature,
            });
            return {
                submit: async (options) => {
                    const response = await this.#client.createWalletTradingWithdraw(
                        request,
                        toConnectCallOptions(options),
                    );
                    return v.parse(CreateWalletTradingWithdrawResultSchema, response);
                },
            };
        }

        if (!validated.payloadSignature) {
            throw new ValidationError(
                "Trading withdraw requires a wallet signer or payload signature.",
            );
        }

        const request = removeUndefined({
            payload: validated.payload,
            payloadSignature: validated.payloadSignature,
        });
        return {
            submit: async (options) => {
                const response = await this.#client.createTradingWithdraw(
                    request,
                    toConnectCallOptions(options),
                );
                return v.parse(CreateTradingWithdrawResultSchema, response);
            },
        };
    }
}
