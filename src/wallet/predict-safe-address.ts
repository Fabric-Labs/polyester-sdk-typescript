import {
	type Address,
	type Hex,
	encodeFunctionData,
	encodePacked,
	getAddress,
	getContractAddress,
	hexToBigInt,
	keccak256,
	zeroAddress,
} from "viem";

/**
 * SafeProxy creation bytecode from @safe-global/safe-contracts v1.4.1
 *
 * This must match the proxyCreationCode() return value from the SafeProxyFactory
 * deployed at SAFE_SMART_ACCOUNT_CONFIG.safeProxyFactoryAddress.
 *
 * The verification script at scripts/verify-safe-prediction.ts validates this.
 */
const SAFE_PROXY_CREATION_CODE: Hex =
	"0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

// ABIs copied from permissionless to ensure exact encoding match

const multiSendAbi = [
	{
		inputs: [{ internalType: "bytes", name: "transactions", type: "bytes" }],
		name: "multiSend",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
] as const;

const enableModulesAbi = [
	{
		inputs: [{ internalType: "address[]", name: "modules", type: "address[]" }],
		name: "enableModules",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

const setupAbi = [
	{
		inputs: [
			{ internalType: "address[]", name: "_owners", type: "address[]" },
			{ internalType: "uint256", name: "_threshold", type: "uint256" },
			{ internalType: "address", name: "to", type: "address" },
			{ internalType: "bytes", name: "data", type: "bytes" },
			{ internalType: "address", name: "fallbackHandler", type: "address" },
			{ internalType: "address", name: "paymentToken", type: "address" },
			{ internalType: "uint256", name: "payment", type: "uint256" },
			{ internalType: "address payable", name: "paymentReceiver", type: "address" },
		],
		name: "setup",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

interface InternalTransaction {
	to: Address;
	data: Hex;
	value: bigint;
	operation: 0 | 1;
}

/**
 * Encodes a single transaction for MultiSend.
 * Matches permissionless encodeInternalTransaction exactly.
 */
function encodeInternalTransaction(tx: InternalTransaction): string {
	const encoded = encodePacked(
		["uint8", "address", "uint256", "uint256", "bytes"],
		[tx.operation, tx.to, tx.value, BigInt((tx.data.length - 2) / 2), tx.data]
	);
	return encoded.slice(2);
}

/**
 * Encodes multiple transactions into MultiSend calldata.
 * Matches permissionless encodeMultiSend exactly.
 */
function encodeMultiSend(txs: InternalTransaction[]): Hex {
	const data: Hex = `0x${txs.map((tx) => encodeInternalTransaction(tx)).join("")}`;
	return encodeFunctionData({
		abi: multiSendAbi,
		functionName: "multiSend",
		args: [data],
	});
}

export interface GetInitializerParams {
	owners: Address[];
	threshold: bigint;
	safeModuleSetupAddress: Address;
	safe4337ModuleAddress: Address;
	multiSendAddress: Address;
	paymentToken?: Address;
	payment?: bigint;
	paymentReceiver?: Address;
	safeModules?: Address[];
	setupTransactions?: { to: Address; data: Hex; value: bigint }[];
}

/**
 * Builds the Safe setup initializer for non-ERC7579 path.
 * Matches permissionless getInitializerCode (non-7579 branch) exactly.
 */
function getInitializerNon7579(params: GetInitializerParams): Hex {
	const {
		owners,
		threshold,
		safeModuleSetupAddress,
		safe4337ModuleAddress,
		multiSendAddress,
		paymentToken = zeroAddress,
		payment = 0n,
		paymentReceiver = zeroAddress,
		safeModules = [],
		setupTransactions = [],
	} = params;

	const multiCalls: InternalTransaction[] = [
		{
			to: safeModuleSetupAddress,
			data: encodeFunctionData({
				abi: enableModulesAbi,
				functionName: "enableModules",
				args: [[safe4337ModuleAddress, ...safeModules]],
			}),
			value: 0n,
			operation: 1,
		},
		...setupTransactions.map((tx) => ({ ...tx, operation: 0 as const })),
	];

	const multiSendCallData = encodeMultiSend(multiCalls);

	return encodeFunctionData({
		abi: setupAbi,
		functionName: "setup",
		args: [
			owners,
			threshold,
			multiSendAddress,
			multiSendCallData,
			safe4337ModuleAddress,
			paymentToken,
			payment,
			paymentReceiver,
		],
	});
}

const createProxyWithNonceAbi = [
	{
		inputs: [
			{ internalType: "address", name: "_singleton", type: "address" },
			{ internalType: "bytes", name: "initializer", type: "bytes" },
			{ internalType: "uint256", name: "saltNonce", type: "uint256" },
		],
		name: "createProxyWithNonce",
		outputs: [{ internalType: "contract SafeProxy", name: "proxy", type: "address" }],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

export interface PredictSafeAddressParams {
	owners: Address[];
	threshold?: bigint;
	saltNonce?: bigint;
	safeProxyFactoryAddress: Address;
	safeSingletonAddress: Address;
	safeModuleSetupAddress: Address;
	safe4337ModuleAddress: Address;
	multiSendAddress: Address;
}

export interface PredictSafeAddressResult {
	address: Address;
	initializer: Hex;
	factoryCalldata: Hex;
}

/**
 * Computes the deterministic Safe smart account address without any RPC calls.
 *
 * This uses the same CREATE2 address derivation algorithm as permissionless@0.2.31:
 * 1. Build Safe setup initializer
 * 2. Compute deploymentCode = proxyCreationCode + singleton address
 * 3. Compute salt = keccak256(keccak256(initializer) + saltNonce)
 * 4. Compute CREATE2 address
 *
 * @param params - Safe account configuration
 * @returns The predicted Safe smart account address
 */
export function predictSafeAddress(params: PredictSafeAddressParams): Address {
	return predictSafeAddressWithData(params).address;
}

/**
 * Computes the deterministic Safe smart account address and returns data
 * needed for ERC-6492 counterfactual signature verification.
 *
 * @param params - Safe account configuration
 * @returns Address, initializer, and factory calldata
 */
export function predictSafeAddressWithData(
	params: PredictSafeAddressParams
): PredictSafeAddressResult {
	const {
		owners,
		threshold = BigInt(owners.length),
		saltNonce = 0n,
		safeProxyFactoryAddress,
		safeSingletonAddress,
		safeModuleSetupAddress,
		safe4337ModuleAddress,
		multiSendAddress,
	} = params;

	const initializer = getInitializerNon7579({
		owners,
		threshold,
		safeModuleSetupAddress,
		safe4337ModuleAddress,
		multiSendAddress,
	});

	const factoryCalldata = encodeFunctionData({
		abi: createProxyWithNonceAbi,
		functionName: "createProxyWithNonce",
		args: [safeSingletonAddress, initializer, saltNonce],
	});

	const deploymentCode = encodePacked(
		["bytes", "uint256"],
		[SAFE_PROXY_CREATION_CODE, hexToBigInt(safeSingletonAddress)]
	);

	const salt = keccak256(
		encodePacked(
			["bytes32", "uint256"],
			[keccak256(encodePacked(["bytes"], [initializer])), saltNonce]
		)
	);

	const address = getAddress(
		getContractAddress({
			from: safeProxyFactoryAddress,
			salt,
			bytecode: deploymentCode,
			opcode: "CREATE2",
		})
	);

	return { address, initializer, factoryCalldata };
}

export { SAFE_PROXY_CREATION_CODE };
