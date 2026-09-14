import { ValidationError } from "../../shared/errors.js";
import { createClient, type Client } from "@connectrpc/connect";
import type { Address, Hex } from "viem";
import { checksumEvmAddress, evmHexToBytes } from "../../utils/evm.js";
import type { ClientCatalog } from "../../catalogs/types.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import { type SubaccountResolver, resolveAccountScopedInput } from "../subaccount-resolver.js";
import type { SdkScales } from "../../shared/decimal-surface.js";
import type { AuthApiTransports } from "../../shared/transports.js";
import { parse } from "../../shared/validation.js";
import {
    createCreateTradingWithdrawToExternalChainInputSchema,
    createCreateTradingWithdrawToFundingInputSchema,
    CreateTradingWithdrawResultSchema,
    CreateWalletTradingWithdrawResultSchema,
    ValidateWithdrawDestinationInputSchema,
    ValidateWithdrawDestinationResultSchema,
    type CreateTradingWithdrawResult,
    type CreateTradingWithdrawToExternalChainInput,
    type CreateTradingWithdrawToExternalChainRequest,
    type CreateTradingWithdrawToFundingInput,
    type CreateTradingWithdrawToFundingRequest,
    type TradingWithdrawIntentPayloadRequest,
    type ValidateWithdrawDestinationInput,
    type ValidateWithdrawDestinationResult,
} from "./trading-withdraws.schemas.js";
import { buildTradingWithdrawWalletMessage } from "./wallet-message.js";

export type TradingWithdrawWalletSigner = {
    signerWallet: string;
    accountId: string;
    /**
     * Signs the UTF-8 message directly using EIP-191 personal_sign, without pre-hashing or switching chains.
     * For a viem account, use `(message) => account.signMessage({ message })`.
     */
    signMessage: (message: string) => Promise<Hex>;
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

async function resolveWalletSignature(params: {
    signingConfig: TradingWithdrawSigningConfig;
    payload: TradingWithdrawIntentPayloadRequest;
    walletSigner: TradingWithdrawWalletSigner;
    targetAccountId: bigint;
}): Promise<{ signerWallet: string; payloadSignature: Uint8Array }> {
    const signerWallet = params.walletSigner.signerWallet.trim().toLowerCase();
    const accountId = idToBigInt(params.walletSigner.accountId, "accountId");
    const signature = await params.walletSigner.signMessage(
        buildTradingWithdrawWalletMessage({
            signingConfig: params.signingConfig,
            payload: params.payload,
            signerWallet,
            accountId,
            targetAccountId: params.targetAccountId,
        }),
    );
    if (!/^0x[0-9a-fA-F]{128}(?:00|01|1[bBcC])$/.test(signature)) {
        throw new ValidationError(
            "Trading withdraw wallet signature must be 65 bytes with recovery byte 0, 1, 27, or 28.",
        );
    }
    return {
        signerWallet,
        payloadSignature: evmHexToBytes(signature),
    };
}

/**
 * Creates durable Trading withdrawal intents to Funding using API signatures or wallet EIP-191 signatures.
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
        transports: AuthApiTransports,
        resolver: SubaccountResolver | undefined,
        signingConfig: TradingWithdrawSigningConfig,
        scales: SdkScales,
        catalog?: ClientCatalog,
    ) {
        this.#client = createClient(Proto.WithdrawService, transports.authApi);
        this.#resolver = resolver;
        this.#signingConfig = signingConfig;
        this.#catalog = catalog;
        this.#scales = scales;
        this.#toFundingInputSchema = createCreateTradingWithdrawToFundingInputSchema(scales);
        this.#toExternalChainInputSchema =
            createCreateTradingWithdrawToExternalChainInputSchema(scales);
    }

    /**
     * Checks whether an external-chain destination can receive a withdrawal without creating, signing, or reserving one.
     */
    async validateDestination(
        input: ValidateWithdrawDestinationInput,
        options?: PolyesterRequestOptions,
    ): Promise<ValidateWithdrawDestinationResult> {
        const request = parse(ValidateWithdrawDestinationInputSchema, input);
        const response = await this.#client.validateWithdrawDestination(
            request,
            toConnectCallOptions(options),
        );
        return parse(ValidateWithdrawDestinationResultSchema, response);
    }

    /**
     * Builds a Trading-to-Funding withdraw intent payload with asset id, decimal amount, destination address, five-minute deadline, nonce, and idempotency key. If a wallet signer is provided, it signs the canonical EIP-191 message and calls the wallet endpoint; otherwise a payload signature is required for the backend-authorized endpoint.
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
        const validated = parse(this.#toFundingInputSchema, resolvedInput);
        return this.#prepareWithdraw(validated, walletSigner);
    }

    /**
     * Builds a Trading-to-external-chain withdraw intent payload with asset id, decimal gross amount, destination network, destination address, five-minute deadline, nonce, and idempotency key. If a wallet signer is provided, it signs the canonical EIP-191 message and calls the wallet endpoint; otherwise a payload signature is required for the backend-authorized endpoint.
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
        const validated = parse(this.#toExternalChainInputSchema, resolvedInput);
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
                    return parse(CreateWalletTradingWithdrawResultSchema, response);
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
                return parse(CreateTradingWithdrawResultSchema, response);
            },
        };
    }
}
