import type { Transport } from "@connectrpc/connect";
import { ApiKeyPoliciesService } from "./api-key-policies/index.js";
import { SubAccountPoliciesService } from "./sub-account-policies/index.js";

export class PoliciesService {
    subaccount: SubAccountPoliciesService;
    apiKey: ApiKeyPoliciesService;

    constructor(transport: Transport) {
        this.subaccount = new SubAccountPoliciesService(transport);
        this.apiKey = new ApiKeyPoliciesService(transport);
    }
}
