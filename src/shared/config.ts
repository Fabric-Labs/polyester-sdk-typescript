import type { SafeVersion } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { type Address, createPublicClient, defineChain, http } from "viem";

type EntryPoint = {
	address: Address;
	version: "0.7";
};

const ENTRY_POINT: EntryPoint = {
	address: "0x59a4B77766509c4507D79eFF8089474eC3daC174",
	version: "0.7",
};

export const PAYMASTER_CLIENT = createPimlicoClient({
	transport: http("https://paymaster.polyester.tech"),
	entryPoint: ENTRY_POINT,
});

export const BUNDLER_TRANSPORT = http("https://bundler.polyester.tech");

interface SafeSmartAccountConfig {
	entryPoint: EntryPoint;
	version: SafeVersion;
	safeModuleSetupAddress?: Address;
	safe4337ModuleAddress?: Address;
	safeProxyFactoryAddress?: Address;
	safeSingletonAddress?: Address;
	multiSendAddress?: Address;
	multiSendCallOnlyAddress?: Address;
}
export const SAFE_SMART_ACCOUNT_CONFIG: SafeSmartAccountConfig = {
	entryPoint: ENTRY_POINT,
	version: "1.4.1",
	safeModuleSetupAddress: "0x80791683D9C079A37Debc67EaDdbFcBC6f0FF2bB",
	safe4337ModuleAddress: "0x0713FF3d4c1b4f177833a372b1e3cb977540EA11",
	safeProxyFactoryAddress: "0xF8F0F649Dd3bFa9095206691E9fb2356c26216dE",
	safeSingletonAddress: "0x92abEa238FEA8908c397cE65366ea9278f0AeC7A",
	multiSendAddress: "0x70C8a8CcB45a8E2589B0f019374fc923dA34E4c7",
	multiSendCallOnlyAddress: "0x375C86a08DA98d1944D7B3c736307A72186CcAf1",
};

export const POLYCHAIN_NETWORK = {
	id: 888168,
	name: "Polyester Chain Testnet",
	nativeCurrency: {
		decimals: 18,
		name: "POL",
		symbol: "POL",
	},
	rpcUrls: {
		default: {
			http: ["https://rpc.polyester.tech"],
		},
	},
};

export const POLYCHAIN = defineChain(POLYCHAIN_NETWORK);

export const POLYCHAIN_PUBLIC_CLIENT = createPublicClient({
	chain: POLYCHAIN,
	transport: http(POLYCHAIN.rpcUrls.default.http[0]),
});
