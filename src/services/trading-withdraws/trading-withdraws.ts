import { create } from "@bufbuild/protobuf";
import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { hexToBytes, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { getZipperContractByName } from "../../catalogs/zipper-catalog.js";
import * as Proto from "../../gen/chain/withdraw/v1/withdraw_pb.js";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime.js";
import { POLYCHAIN } from "../../shared/config.js";
import { idToBigInt } from "../../utils/base58-id.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
import { type SubAccountResolver, resolveSubAccountScopedInput } from "../sub-account-resolver.js";
import { TradingWithdrawActionCodec } from "./trading-withdraws.codecs.js";
import {
	CreateTradingWithdrawResultSchema,
	CreateTradingWithdrawToFundingInputSchema,
	type CreateTradingWithdrawResult,
	type CreateTradingWithdrawToFundingInput,
} from "./trading-withdraws.schemas.js";

const DEFAULT_DEADLINE_SECONDS = 5 * 60;

export type TradingWithdrawWalletTypedData = ReturnType<typeof buildTradingWithdrawWalletTypedData>;

export type TradingWithdrawWalletSigner = {
	signerWallet: string;
	accountId: string;
	signTypedData: (typedData: TradingWithdrawWalletTypedData) => Promise<Hex>;
};

export type CreateTradingWithdrawToFundingServiceInput = CreateTradingWithdrawToFundingInput & {
	walletSigner?: TradingWithdrawWalletSigner;
};

export type TradingWithdrawMutationOptions = {
	stepUpToken?: string | null;
};

function toU128(value: bigint): Proto.U128 {
	if (value < 0n) {
		throw new Error("U128 value must be zero or greater.");
	}

	return create(Proto.U128Schema, {
		hi: value >> 64n,
		lo: value & ((1n << 64n) - 1n),
	});
}

function createNonce(): bigint {
	const random = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
	if (!random) return BigInt(Date.now());

	const bytes = new BigUint64Array(1);
	random(bytes);
	return bytes[0] ?? BigInt(Date.now());
}

function fromU128(value: Proto.U128 | undefined): bigint {
	if (!value) return 0n;
	return (value.hi << 64n) + value.lo;
}

function resolveTradingGatewayAddress(): Address {
	const address = getZipperContractByName("tradingGateway")?.address?.trim();
	if (!address?.startsWith("0x")) {
		throw new Error("Trading Gateway contract address is unavailable.");
	}
	return address as Address;
}

function buildTradingWithdrawWalletTypedData(params: {
	payload: Proto.TradingWithdrawIntentPayload;
	signerWallet: Address;
	accountId: bigint;
	targetAccountId: bigint;
}) {
	const payload = params.payload;
	return {
		domain: {
			name: "Polyester Trading Withdraw",
			version: "1",
			chainId: POLYCHAIN.id,
			verifyingContract: resolveTradingGatewayAddress(),
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
			destinationChainId: payload.destinationChainId,
			amountQ: fromU128(payload.amountQ),
			destinationHash: keccak256(stringToBytes((payload.destinationAddress ?? "").trim())),
			deadlineTsSec: payload.deadlineTsSec,
			nonce: fromU128(payload.nonce),
			idempotencyKeyHash: keccak256(stringToBytes(payload.idempotencyKey.trim())),
		},
	} as const;
}

async function resolveWalletSignature(params: {
	payload: Proto.TradingWithdrawIntentPayload;
	walletSigner: TradingWithdrawWalletSigner;
	targetAccountId: bigint;
}): Promise<{ signerWallet: string; payloadSignature: Uint8Array }> {
	const signerWallet = params.walletSigner.signerWallet.trim();
	if (!signerWallet.startsWith("0x")) {
		throw new Error("Trading withdraw signer wallet is required.");
	}
	const signature = await params.walletSigner.signTypedData(
		buildTradingWithdrawWalletTypedData({
			payload: params.payload,
			signerWallet: signerWallet as Address,
			accountId: idToBigInt(params.walletSigner.accountId, "accountId"),
			targetAccountId: params.targetAccountId,
		})
	);
	return {
		signerWallet,
		payloadSignature: hexToBytes(signature),
	};
}

export class TradingWithdrawsService {
	#client: Client<typeof Proto.WithdrawService>;
	#resolver?: SubAccountResolver;
	#localMock?: LocalMockRuntime;

	constructor(transport: Transport, resolver?: SubAccountResolver, localMock?: LocalMockRuntime) {
		this.#client = createClient(Proto.WithdrawService, transport);
		this.#resolver = resolver;
		this.#localMock = localMock;
	}

	async createToFunding(
		input: CreateTradingWithdrawToFundingServiceInput,
		options?: TradingWithdrawMutationOptions
	): Promise<CreateTradingWithdrawResult> {
		this.#localMock?.assertMutationAllowed("tradingWithdraws.createToFunding");
		const { walletSigner, ...inputForValidation } = input;
		const resolvedInput = resolveSubAccountScopedInput(inputForValidation, this.#resolver);
		const validated = CreateTradingWithdrawToFundingInputSchema.parse(resolvedInput);
		const payload = create(Proto.TradingWithdrawIntentPayloadSchema, {
			action: TradingWithdrawActionCodec.inputToProto.to_funding,
			assetId: validated.assetId,
			destinationChainId: 0n,
			amountQ: toU128(validated.quantityScaled),
			deadlineTsSec: BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS),
			nonce: toU128(createNonce()),
			destinationAddress: validated.destinationAddress,
			idempotencyKey: validated.idempotencyKey,
		});

		if (walletSigner) {
			const walletSignature = await resolveWalletSignature({
				payload,
				walletSigner,
				targetAccountId:
					validated.subaccountId ?? idToBigInt(walletSigner.accountId, "targetAccountId"),
			});
			const response = await this.#client.createWalletTradingWithdraw(
				create(Proto.CreateWalletTradingWithdrawRequestSchema, {
					payload,
					subaccountId: validated.subaccountId ?? 0n,
					signerWallet: walletSignature.signerWallet,
					payloadSignature: walletSignature.payloadSignature,
				}),
				stepUpCallOptions(options?.stepUpToken)
			);
			return CreateTradingWithdrawResultSchema.parse(response);
		}

		if (!validated.payloadSignature) {
			throw new Error("Trading withdraw requires a wallet signer or payload signature.");
		}

		const response = await this.#client.createTradingWithdraw(
			create(Proto.CreateTradingWithdrawRequestSchema, {
				payload,
				payloadSignature: validated.payloadSignature,
			}),
			stepUpCallOptions(options?.stepUpToken)
		);
		return CreateTradingWithdrawResultSchema.parse(response);
	}
}
