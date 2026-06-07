import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import {
    toConnectCallOptions,
    type PolyesterMutationOptions,
    type PolyesterRequestOptions,
} from "../../shared/request-options.js";
import * as v from "valibot";
import {
    BeginMfaChallengeInputSchema,
    BeginMfaChallengeResultSchema,
    BeginPasskeyEnrollmentInputSchema,
    BeginPasskeyEnrollmentResultSchema,
    BeginTotpEnrollmentInputSchema,
    BeginTotpEnrollmentResultSchema,
    ClaimFreshStepUpInputSchema,
    ClaimFreshStepUpResultSchema,
    CompleteMfaChallengeResultSchema,
    ConsumeFreshStepUpInputSchema,
    DeleteMfaFactorInputSchema,
    UpdateMfaFactorInputSchema,
    UpdateMfaFactorResultSchema,
    FinishPasskeyChallengeInputSchema,
    FinishPasskeyEnrollmentInputSchema,
    FinishPasskeyEnrollmentResultSchema,
    FinishTotpEnrollmentInputSchema,
    FinishTotpEnrollmentResultSchema,
    ListMfaFactorsResponseSchema,
    RegenerateRecoveryCodesInputSchema,
    RegenerateRecoveryCodesResultSchema,
    ReleaseFreshStepUpInputSchema,
    VerifyRecoveryCodeChallengeInputSchema,
    VerifyTotpChallengeInputSchema,
    type BeginMfaChallengeInput,
    type BeginMfaChallengeResult,
    type BeginPasskeyEnrollmentInput,
    type BeginPasskeyEnrollmentResult,
    type BeginTotpEnrollmentInput,
    type BeginTotpEnrollmentResult,
    type ClaimFreshStepUpInput,
    type ClaimFreshStepUpResult,
    type CompleteMfaChallengeResult,
    type ConsumeFreshStepUpInput,
    type DeleteMfaFactorInput,
    type UpdateMfaFactorInput,
    type UpdateMfaFactorResult,
    type FinishPasskeyChallengeInput,
    type FinishPasskeyEnrollmentInput,
    type FinishPasskeyEnrollmentResult,
    type FinishTotpEnrollmentInput,
    type FinishTotpEnrollmentResult,
    type ListMfaFactorsResult,
    type RegenerateRecoveryCodesInput,
    type RegenerateRecoveryCodesResult,
    type ReleaseFreshStepUpInput,
    type VerifyRecoveryCodeChallengeInput,
    type VerifyTotpChallengeInput,
} from "./mfa.schemas.js";

export class MfaService {
    #client: Client<typeof Proto.MFAService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.MFAService, transport);
    }

    async listFactors(options?: PolyesterRequestOptions): Promise<ListMfaFactorsResult> {
        const res = await this.#client.listMFAFactors({}, toConnectCallOptions(options));
        return v.parse(ListMfaFactorsResponseSchema, res);
    }

    async beginTotpEnrollment(
        input: BeginTotpEnrollmentInput,
        options?: PolyesterMutationOptions,
    ): Promise<BeginTotpEnrollmentResult> {
        const req = v.parse(BeginTotpEnrollmentInputSchema, input);
        const res = await this.#client.beginTOTPEnrollment(req, toConnectCallOptions(options));
        return v.parse(BeginTotpEnrollmentResultSchema, res);
    }

    async finishTotpEnrollment(
        input: FinishTotpEnrollmentInput,
        options?: PolyesterRequestOptions,
    ): Promise<FinishTotpEnrollmentResult> {
        const req = v.parse(FinishTotpEnrollmentInputSchema, input);
        const res = await this.#client.finishTOTPEnrollment(req, toConnectCallOptions(options));
        return v.parse(FinishTotpEnrollmentResultSchema, res);
    }

    async beginPasskeyEnrollment(
        input: BeginPasskeyEnrollmentInput,
        options?: PolyesterMutationOptions,
    ): Promise<BeginPasskeyEnrollmentResult> {
        const req = v.parse(BeginPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.beginPasskeyEnrollment(req, toConnectCallOptions(options));
        return v.parse(BeginPasskeyEnrollmentResultSchema, res);
    }

    async finishPasskeyEnrollment(
        input: FinishPasskeyEnrollmentInput,
        options?: PolyesterRequestOptions,
    ): Promise<FinishPasskeyEnrollmentResult> {
        const req = v.parse(FinishPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.finishPasskeyEnrollment(req, toConnectCallOptions(options));
        return v.parse(FinishPasskeyEnrollmentResultSchema, res);
    }

    async beginChallenge(
        input: BeginMfaChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<BeginMfaChallengeResult> {
        const req = v.parse(BeginMfaChallengeInputSchema, input);
        const res = await this.#client.beginMFAChallenge(req, toConnectCallOptions(options));
        return v.parse(BeginMfaChallengeResultSchema, res);
    }

    async verifyTotpChallenge(
        input: VerifyTotpChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(VerifyTotpChallengeInputSchema, input);
        const res = await this.#client.verifyTOTPChallenge(req, toConnectCallOptions(options));
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async finishPasskeyChallenge(
        input: FinishPasskeyChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(FinishPasskeyChallengeInputSchema, input);
        const res = await this.#client.finishPasskeyChallenge(req, toConnectCallOptions(options));
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async verifyRecoveryCodeChallenge(
        input: VerifyRecoveryCodeChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(VerifyRecoveryCodeChallengeInputSchema, input);
        const res = await this.#client.verifyRecoveryCodeChallenge(
            req,
            toConnectCallOptions(options),
        );
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async deleteFactor(
        input: DeleteMfaFactorInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const { factorId } = v.parse(DeleteMfaFactorInputSchema, input);
        await this.#client.deleteMFAFactor({ factorId }, toConnectCallOptions(options));
    }

    async updateFactor(
        input: UpdateMfaFactorInput,
        options?: PolyesterMutationOptions,
    ): Promise<UpdateMfaFactorResult> {
        const { factorId, label } = v.parse(UpdateMfaFactorInputSchema, input);
        const res = await this.#client.updateMFAFactor(
            { factorId, label },
            toConnectCallOptions(options),
        );
        return v.parse(UpdateMfaFactorResultSchema, res);
    }

    async regenerateRecoveryCodes(
        input: RegenerateRecoveryCodesInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<RegenerateRecoveryCodesResult> {
        v.parse(RegenerateRecoveryCodesInputSchema, input);
        const res = await this.#client.regenerateRecoveryCodes({}, toConnectCallOptions(options));
        return v.parse(RegenerateRecoveryCodesResultSchema, res);
    }

    async claimFreshStepUp(
        input: ClaimFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<ClaimFreshStepUpResult> {
        const req = v.parse(ClaimFreshStepUpInputSchema, input);
        const res = await this.#client.claimFreshStepUp(req, toConnectCallOptions(options));
        return v.parse(ClaimFreshStepUpResultSchema, res);
    }

    async consumeFreshStepUp(
        input: ConsumeFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<void> {
        const req = v.parse(ConsumeFreshStepUpInputSchema, input);
        await this.#client.consumeFreshStepUp(removeUndefined(req), toConnectCallOptions(options));
    }

    async releaseFreshStepUp(
        input: ReleaseFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<void> {
        const req = v.parse(ReleaseFreshStepUpInputSchema, input);
        await this.#client.releaseFreshStepUp(removeUndefined(req), toConnectCallOptions(options));
    }
}
