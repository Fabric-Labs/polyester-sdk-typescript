/**
 * Verification script for deterministic Safe address prediction.
 *
 * This script compares the predicted Safe address (zero-RPC) against the
 * address returned by toSafeSmartAccount (which makes an RPC call to get proxyCreationCode).
 *
 * Run with: bun packages/polyester-client/scripts/verify-safe-prediction.ts
 *
 * If the addresses don't match, it means either:
 * 1. The SafeProxy bytecode in SAFE_PROXY_CREATION_CODE doesn't match the deployed factory
 * 2. The initializer encoding differs from permissionless
 * 3. The Safe config addresses are incorrect
 */

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import {
  predictSafeAddress,
  SAFE_PROXY_CREATION_CODE,
} from "../src/polyester-client/src/wallet/predict-safe-address.js";
import {
  SAFE_SMART_ACCOUNT_CONFIG,
  POLYCHAIN_PUBLIC_CLIENT,
} from "../src/polyester-client/src/shared/config.js";

async function main(): Promise<void> {
  console.log("=== Safe Address Prediction Verification ===\n");

  // generate a random test owner
  const privateKey = generatePrivateKey();
  const owner = privateKeyToAccount(privateKey);

  console.log(`Test owner address: ${owner.address}`);
  console.log(`Salt nonce: 0n (default)\n`);

  const {
    safeProxyFactoryAddress,
    safeSingletonAddress,
    safeModuleSetupAddress,
    safe4337ModuleAddress,
    multiSendAddress,
  } = SAFE_SMART_ACCOUNT_CONFIG;

  if (
    !safeProxyFactoryAddress ||
    !safeSingletonAddress ||
    !safeModuleSetupAddress ||
    !safe4337ModuleAddress ||
    !multiSendAddress
  ) {
    console.error("ERROR: SAFE_SMART_ACCOUNT_CONFIG is missing required addresses");
    process.exit(1);
  }

  console.log("Safe Config:");
  console.log(`  Factory:     ${safeProxyFactoryAddress}`);
  console.log(`  Singleton:   ${safeSingletonAddress}`);
  console.log(`  ModuleSetup: ${safeModuleSetupAddress}`);
  console.log(`  4337Module:  ${safe4337ModuleAddress}`);
  console.log(`  MultiSend:   ${multiSendAddress}`);
  console.log();

  // predicted address (zero-RPC)
  console.log("Computing predicted address (zero-RPC)...");
  const predictedAddress = predictSafeAddress({
    owners: [owner.address],
    saltNonce: 0n,
    safeProxyFactoryAddress,
    safeSingletonAddress,
    safeModuleSetupAddress,
    safe4337ModuleAddress,
    multiSendAddress,
  });
  console.log(`  Predicted: ${predictedAddress}`);

  // actual address from toSafeSmartAccount (RPC call)
  console.log("\nFetching actual address via toSafeSmartAccount (RPC call)...");
  try {
    const smartAccount = await toSafeSmartAccount({
      client: POLYCHAIN_PUBLIC_CLIENT,
      owners: [owner],
      saltNonce: 0n,
      ...SAFE_SMART_ACCOUNT_CONFIG,
    });
    const actualAddress = smartAccount.address;
    console.log(`  Actual:    ${actualAddress}`);

    // compare
    console.log("\n=== Result ===");
    if (predictedAddress.toLowerCase() === actualAddress.toLowerCase()) {
      console.log("PASS: Addresses match!");
      console.log("\nThe deterministic prediction is working correctly.");
      console.log("Login can safely use predictSafeAddress without RPC calls.");
    } else {
      console.log("FAIL: Addresses do not match!");
      console.log("\nPossible causes:");
      console.log("  1. SafeProxy bytecode mismatch with deployed factory");
      console.log("  2. Initializer encoding differs from permissionless");
      console.log("  3. Config addresses don't match deployed contracts");
      console.log("\nDebug info:");
      console.log(`  Proxy bytecode length: ${SAFE_PROXY_CREATION_CODE.length} chars`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\nERROR: Failed to get address from toSafeSmartAccount");
    console.error(error);
    console.log("\nThis might mean:");
    console.log("  - RPC endpoint is unavailable");
    console.log("  - Safe contracts not deployed at configured addresses");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
