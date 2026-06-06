import type { Address, Hex, LocalAccount } from "viem";
import { concat, encodeAbiParameters, hashMessage, hashTypedData, toBytes } from "viem";
import {
    predictSafeAddressWithData,
    type PredictSafeAddressParams,
} from "./predict-safe-address.js";
import type { HexAddress, PolyesterWallet } from "./types.js";
import { POLYCHAIN_NETWORK } from "../shared/config.js";

/** ERC-6492 magic suffix for counterfactual signature verification */
const ERC6492_MAGIC_SUFFIX: Hex =
    "0x6492649264926492649264926492649264926492649264926492649264926492";

export interface CreateLoginWalletParams {
    /** The owner account (EOA) that will sign messages */
    owner: LocalAccount;
    /** Salt nonce for deriving different Safe addresses from the same owner (default: 0n) */
    saltNonce?: bigint;
    /** Safe contract addresses configuration */
    safeProxyFactoryAddress: Address;
    safeSingletonAddress: Address;
    safeModuleSetupAddress: Address;
    safe4337ModuleAddress: Address;
    multiSendAddress: Address;
    /** Chain ID for EIP-712 domain (defaults to POLYCHAIN_NETWORK.id) */
    chainId?: number;
}

/**
 * Adjusts the V value in a signature for Safe's eth_sign verification.
 * Safe expects V to be 31+ for eth_sign signatures (27 base + 4 for eth_sign marker).
 */
function adjustVInSignature(signature: Hex): Hex {
    const ETHEREUM_V_VALUES = [0, 1, 27, 28];
    const MIN_VALID_V_VALUE_FOR_SAFE_ECDSA = 27;

    let signatureV = Number.parseInt(signature.slice(-2), 16);
    if (!ETHEREUM_V_VALUES.includes(signatureV)) {
        throw new Error("Invalid signature V value");
    }

    // for eth_sign: add 27 if V < 27, then add 4
    if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
        signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
    }
    signatureV += 4;

    return (signature.slice(0, -2) + signatureV.toString(16).padStart(2, "0")) as Hex;
}

/**
 * Wraps a signature in ERC-6492 format for counterfactual verification.
 * This allows signature verification before the Safe is deployed.
 */
function wrapErc6492Signature(factoryAddress: Address, factoryCalldata: Hex, signature: Hex): Hex {
    const encoded = encodeAbiParameters(
        [
            { name: "factory", type: "address" },
            { name: "factoryCalldata", type: "bytes" },
            { name: "signature", type: "bytes" },
        ],
        [factoryAddress, factoryCalldata, signature],
    );
    return concat([encoded, ERC6492_MAGIC_SUFFIX]);
}

/**
 * Creates a PolyesterWallet for login/authentication without any RPC calls.
 *
 * This computes the Safe smart account address deterministically and produces
 * ERC-6492 wrapped signatures for counterfactual verification. The signature
 * matches what toSafeSmartAccount.signMessage() would produce for an undeployed Safe.
 *
 * For actual chain interactions (UserOperations), use createPolyesterSmartAccount instead.
 *
 * @param params - Owner account and Safe configuration
 * @returns A PolyesterWallet that can be used for authentication
 */
export function createLoginWallet(params: CreateLoginWalletParams): PolyesterWallet {
    const {
        owner,
        saltNonce = 0n,
        safeProxyFactoryAddress,
        safeSingletonAddress,
        safeModuleSetupAddress,
        safe4337ModuleAddress,
        multiSendAddress,
        chainId = POLYCHAIN_NETWORK.id,
    } = params;

    const predictParams: PredictSafeAddressParams = {
        owners: [owner.address],
        saltNonce,
        safeProxyFactoryAddress,
        safeSingletonAddress,
        safeModuleSetupAddress,
        safe4337ModuleAddress,
        multiSendAddress,
    };

    const { address, factoryCalldata } = predictSafeAddressWithData(predictParams);

    return {
        address: address as HexAddress,
        ownerAddress: owner.address as HexAddress,
        signMessage: async (message: string): Promise<HexAddress> => {
            // 1. hash the original message (what Safe calls generateSafeMessageMessage for strings)
            const messageHash = hashMessage(message);

            // 2. create EIP-712 typed data hash matching Safe's signMessage
            const safeMessageHash = hashTypedData({
                domain: {
                    chainId,
                    verifyingContract: address,
                },
                types: {
                    SafeMessage: [{ name: "message", type: "bytes" }],
                },
                primaryType: "SafeMessage",
                message: {
                    message: messageHash,
                },
            });

            // 3. sign the Safe message hash with raw bytes
            const ownerSignature = await owner.signMessage({
                message: { raw: toBytes(safeMessageHash) },
            });

            // 4. adjust V value for Safe's eth_sign verification
            const innerSignature = adjustVInSignature(ownerSignature as Hex);

            // 5. wrap in ERC-6492 format for counterfactual verification
            return wrapErc6492Signature(
                safeProxyFactoryAddress,
                factoryCalldata,
                innerSignature,
            ) as HexAddress;
        },
    };
}
