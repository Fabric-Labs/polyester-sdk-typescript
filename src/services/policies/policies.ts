import type { Transport } from "@connectrpc/connect";
import { ApiKeyPoliciesService } from "./api-key-policies";
import { SubAccountPoliciesService } from "./sub-account-policies";
import type { LocalMockRuntime } from "../../mock/local-mock-runtime";

export class PoliciesService {
	subaccount: SubAccountPoliciesService;
	apiKey: ApiKeyPoliciesService;

	constructor(transport: Transport, localMock?: LocalMockRuntime) {
		this.subaccount = new SubAccountPoliciesService(transport, localMock);
		this.apiKey = new ApiKeyPoliciesService(transport, localMock);
	}
}
