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

/**
 * Manages MFA enrollment, challenges, recovery codes, session elevation, and fresh step-up proofs.
 */
export class MfaService {
    #client: Client<typeof Proto.MFAService>;

    constructor(transport: Transport) {
        this.#client = createClient(Proto.MFAService, transport);
    }

    /**
     * Returns the caller's enrolled MFA factors, oldest first, and whether unused recovery codes exist.
     */
    async listFactors(options?: PolyesterRequestOptions): Promise<ListMfaFactorsResult> {
        const res = await this.#client.listMFAFactors({}, toConnectCallOptions(options));
        return v.parse(ListMfaFactorsResponseSchema, res);
    }

    /**
     * Creates an authenticator-app enrollment challenge and returns the secret, QR-compatible otpauth URI, enrollment ID, and expiry.
     */
    async beginTotpEnrollment(
        input: BeginTotpEnrollmentInput,
        options?: PolyesterMutationOptions,
    ): Promise<BeginTotpEnrollmentResult> {
        const req = v.parse(BeginTotpEnrollmentInputSchema, input);
        const res = await this.#client.beginTOTPEnrollment(req, toConnectCallOptions(options));
        return v.parse(BeginTotpEnrollmentResultSchema, res);
    }

    /**
     * Verifies the first authenticator code, activates the factor, and returns one-time recovery codes that are only shown in this response.
     */
    async finishTotpEnrollment(
        input: FinishTotpEnrollmentInput,
        options?: PolyesterRequestOptions,
    ): Promise<FinishTotpEnrollmentResult> {
        const req = v.parse(FinishTotpEnrollmentInputSchema, input);
        const res = await this.#client.finishTOTPEnrollment(req, toConnectCallOptions(options));
        return v.parse(FinishTotpEnrollmentResultSchema, res);
    }

    /**
     * Creates passkey registration options for a new factor and returns the enrollment challenge and expiry.
     */
    async beginPasskeyEnrollment(
        input: BeginPasskeyEnrollmentInput,
        options?: PolyesterMutationOptions,
    ): Promise<BeginPasskeyEnrollmentResult> {
        const req = v.parse(BeginPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.beginPasskeyEnrollment(req, toConnectCallOptions(options));
        return v.parse(BeginPasskeyEnrollmentResultSchema, res);
    }

    /**
     * Verifies the passkey registration response, activates the factor, and returns one-time recovery codes.
     */
    async finishPasskeyEnrollment(
        input: FinishPasskeyEnrollmentInput,
        options?: PolyesterRequestOptions,
    ): Promise<FinishPasskeyEnrollmentResult> {
        const req = v.parse(FinishPasskeyEnrollmentInputSchema, input);
        const res = await this.#client.finishPasskeyEnrollment(req, toConnectCallOptions(options));
        return v.parse(FinishPasskeyEnrollmentResultSchema, res);
    }

    /**
     * Starts an MFA challenge for either session elevation or fresh step-up and returns allowed factor types plus passkey request options when available.
     */
    async beginChallenge(
        input: BeginMfaChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<BeginMfaChallengeResult> {
        const req = v.parse(BeginMfaChallengeInputSchema, input);
        const res = await this.#client.beginMFAChallenge(req, toConnectCallOptions(options));
        return v.parse(BeginMfaChallengeResultSchema, res);
    }

    /**
     * Completes a challenge with an authenticator code, returning either an elevated access token or a fresh step-up token depending on the challenge purpose.
     */
    async verifyTotpChallenge(
        input: VerifyTotpChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(VerifyTotpChallengeInputSchema, input);
        const res = await this.#client.verifyTOTPChallenge(req, toConnectCallOptions(options));
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    /**
     * Completes a challenge with a passkey authentication response, returning session assurance and the relevant token for the challenge purpose.
     */
    async finishPasskeyChallenge(
        input: FinishPasskeyChallengeInput,
        options?: PolyesterRequestOptions,
    ): Promise<CompleteMfaChallengeResult> {
        const req = v.parse(FinishPasskeyChallengeInputSchema, input);
        const res = await this.#client.finishPasskeyChallenge(req, toConnectCallOptions(options));
        return v.parse(CompleteMfaChallengeResultSchema, res);
    }

    /**
     * Consumes a one-time recovery code to complete session elevation or fresh step-up.
     */
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

    /**
     * Removes an enrolled MFA factor by factor ID; backend policy may require fresh step-up for this protected action.
     */
    async deleteFactor(
        input: DeleteMfaFactorInput,
        options?: PolyesterMutationOptions,
    ): Promise<void> {
        const { factorId } = v.parse(DeleteMfaFactorInputSchema, input);
        await this.#client.deleteMFAFactor({ factorId }, toConnectCallOptions(options));
    }

    /**
     * Updates an MFA factor label, where an empty label clears the display name.
     */
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

    /**
     * Rotates recovery codes after step-up and returns the new one-time codes, which are only available in this response.
     */
    async regenerateRecoveryCodes(
        input: RegenerateRecoveryCodesInput = {},
        options?: PolyesterMutationOptions,
    ): Promise<RegenerateRecoveryCodesResult> {
        v.parse(RegenerateRecoveryCodesInputSchema, input);
        const res = await this.#client.regenerateRecoveryCodes({}, toConnectCallOptions(options));
        return v.parse(RegenerateRecoveryCodesResultSchema, res);
    }

    /**
     * Binds a fresh step-up proof to one protected request using a request ID, action type, and subject, returning a claim nonce and expiry.
     */
    async claimFreshStepUp(
        input: ClaimFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<ClaimFreshStepUpResult> {
        const req = v.parse(ClaimFreshStepUpInputSchema, input);
        const res = await this.#client.claimFreshStepUp(req, toConnectCallOptions(options));
        return v.parse(ClaimFreshStepUpResultSchema, res);
    }

    /**
     * Marks a claimed fresh step-up proof as used after the protected request succeeds, echoing the original request binding and claim nonce.
     */
    async consumeFreshStepUp(
        input: ConsumeFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<void> {
        const req = v.parse(ConsumeFreshStepUpInputSchema, input);
        await this.#client.consumeFreshStepUp(removeUndefined(req), toConnectCallOptions(options));
    }

    /**
     * Releases a claimed fresh step-up proof when the protected request is abandoned or fails, preserving the original request binding and reason.
     */
    async releaseFreshStepUp(
        input: ReleaseFreshStepUpInput,
        options?: PolyesterRequestOptions,
    ): Promise<void> {
        const req = v.parse(ReleaseFreshStepUpInputSchema, input);
        await this.#client.releaseFreshStepUp(removeUndefined(req), toConnectCallOptions(options));
    }
}
