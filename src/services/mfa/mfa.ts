import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
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

    async listFactors(): Promise<ListMfaFactorsResult> {
        const res = await this.#client.listMFAFactors({});
        return v.parse(ListMfaFactorsResponseSchema, res);
    }

    async beginTotpEnrollment(input: BeginTotpEnrollmentInput): Promise<BeginTotpEnrollmentResult> {
        const { stepUpToken, ...req } = v.parse(BeginTotpEnrollmentInputSchema, input);
        const res = await this.#client.beginTOTPEnrollment(
            req,
            stepUpCallOptions(stepUpToken ?? undefined),
        );
        return v.parse(BeginTotpEnrollmentResultSchema, res);
    }

    async finishTotpEnrollment(
        input: FinishTotpEnrollmentInput,
    ): Promise<FinishTotpEnrollmentResult> {
        const req = v.parse(FinishTotpEnrollmentInputSchema, input);
        const res = await this.#client.finishTOTPEnrollment(req);
        return v.parse(FinishTotpEnrollmentResultSchema, res);
    }

    async beginPasskeyEnrollment(
        input: BeginPasskeyEnrollmentInput,
    ): Promise<BeginPasskeyEnrollmentResult> {
        const { stepUpToken, ...req } = v.parse(BeginPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.beginPasskeyEnrollment(
            req,
            stepUpCallOptions(stepUpToken ?? undefined),
        );
        return v.parse(BeginPasskeyEnrollmentResultSchema, res);
    }

    async finishPasskeyEnrollment(
        input: FinishPasskeyEnrollmentInput,
    ): Promise<FinishPasskeyEnrollmentResult> {
        const req = v.parse(FinishPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.finishPasskeyEnrollment(req);
        return v.parse(FinishPasskeyEnrollmentResultSchema, res);
    }

    async beginChallenge(input: BeginMfaChallengeInput): Promise<BeginMfaChallengeResult> {
        const req = v.parse(BeginMfaChallengeInputSchema, input);
        const res = await this.#client.beginMFAChallenge(req);
        return v.parse(BeginMfaChallengeResultSchema, res);
    }

    async verifyTotpChallenge(
        input: VerifyTotpChallengeInput,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(VerifyTotpChallengeInputSchema, input);
        const res = await this.#client.verifyTOTPChallenge(req);
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async finishPasskeyChallenge(
        input: FinishPasskeyChallengeInput,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(FinishPasskeyChallengeInputSchema, input);
        const res = await this.#client.finishPasskeyChallenge(req);
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async verifyRecoveryCodeChallenge(
        input: VerifyRecoveryCodeChallengeInput,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(VerifyRecoveryCodeChallengeInputSchema, input);
        const res = await this.#client.verifyRecoveryCodeChallenge(req);
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    async deleteFactor(input: DeleteMfaFactorInput): Promise<void> {
        const { factorId, stepUpToken } = v.parse(DeleteMfaFactorInputSchema, input);
        await this.#client.deleteMFAFactor(
            { factorId },
            stepUpCallOptions(stepUpToken ?? undefined),
        );
    }

    async updateFactor(input: UpdateMfaFactorInput): Promise<UpdateMfaFactorResult> {
        const { factorId, label, stepUpToken } = v.parse(UpdateMfaFactorInputSchema, input);
        const res = await this.#client.updateMFAFactor(
            { factorId, label },
            stepUpCallOptions(stepUpToken ?? undefined),
        );
        return v.parse(UpdateMfaFactorResultSchema, res);
    }

    async regenerateRecoveryCodes(
        input: RegenerateRecoveryCodesInput = {},
    ): Promise<RegenerateRecoveryCodesResult> {
        const { stepUpToken } = v.parse(RegenerateRecoveryCodesInputSchema, input);
        const res = await this.#client.regenerateRecoveryCodes(
            {},
            stepUpCallOptions(stepUpToken ?? undefined),
        );
        return v.parse(RegenerateRecoveryCodesResultSchema, res);
    }

    async claimFreshStepUp(input: ClaimFreshStepUpInput): Promise<ClaimFreshStepUpResult> {
        const req = v.parse(ClaimFreshStepUpInputSchema, input);
        const res = await this.#client.claimFreshStepUp(req);
        return v.parse(ClaimFreshStepUpResultSchema, res);
    }

    async consumeFreshStepUp(input: ConsumeFreshStepUpInput): Promise<void> {
        const req = v.parse(ConsumeFreshStepUpInputSchema, input);
        await this.#client.consumeFreshStepUp(removeUndefined(req));
    }

    async releaseFreshStepUp(input: ReleaseFreshStepUpInput): Promise<void> {
        const req = v.parse(ReleaseFreshStepUpInputSchema, input);
        await this.#client.releaseFreshStepUp(removeUndefined(req));
    }
}
