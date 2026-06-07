import type { Transport } from "@connectrpc/connect";
import type { RealtimeClient } from "../../realtime/index.js";
import { ApiKeyPoliciesService } from "./api-key-policies/index.js";
import { SubAccountPoliciesService } from "./sub-account-policies/index.js";

export class PoliciesService {
    subaccount: SubAccountPoliciesService;
    apiKey: ApiKeyPoliciesService;

    constructor(transport: Transport, realtime: RealtimeClient) {
        this.subaccount = new SubAccountPoliciesService(transport, realtime);
        this.apiKey = new ApiKeyPoliciesService(transport);
    }
}
