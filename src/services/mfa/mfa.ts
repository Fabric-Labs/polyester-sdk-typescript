import { createClient, type Client, type Transport } from "@connectrpc/connect";
import * as Proto from "../../gen/auth/v1/mfa_pb.js";
import { removeUndefined } from "../../utils/remove-undefined.js";
import { stepUpCallOptions } from "../../utils/step-up-call-options.js";
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
		return ListMfaFactorsResponseSchema.parse(res);
	}

	async beginTotpEnrollment(input: BeginTotpEnrollmentInput): Promise<BeginTotpEnrollmentResult> {
		const { stepUpToken, ...req } = BeginTotpEnrollmentInputSchema.parse(input);
		const res = await this.#client.beginTOTPEnrollment(
			req,
			stepUpCallOptions(stepUpToken ?? undefined)
		);
		return BeginTotpEnrollmentResultSchema.parse(res);
	}

	async finishTotpEnrollment(
		input: FinishTotpEnrollmentInput
	): Promise<FinishTotpEnrollmentResult> {
		const req = FinishTotpEnrollmentInputSchema.parse(input);
		const res = await this.#client.finishTOTPEnrollment(req);
		return FinishTotpEnrollmentResultSchema.parse(res);
	}

	async beginPasskeyEnrollment(
		input: BeginPasskeyEnrollmentInput
	): Promise<BeginPasskeyEnrollmentResult> {
		const { stepUpToken, ...req } = BeginPasskeyEnrollmentInputSchema.parse(input);
		const res = await this.#client.beginPasskeyEnrollment(
			req,
			stepUpCallOptions(stepUpToken ?? undefined)
		);
		return BeginPasskeyEnrollmentResultSchema.parse(res);
	}

	async finishPasskeyEnrollment(
		input: FinishPasskeyEnrollmentInput
	): Promise<FinishPasskeyEnrollmentResult> {
		const req = FinishPasskeyEnrollmentInputSchema.parse(input);
		const res = await this.#client.finishPasskeyEnrollment(req);
		return FinishPasskeyEnrollmentResultSchema.parse(res);
	}

	async beginChallenge(input: BeginMfaChallengeInput): Promise<BeginMfaChallengeResult> {
		const req = BeginMfaChallengeInputSchema.parse(input);
		const res = await this.#client.beginMFAChallenge(req);
		return BeginMfaChallengeResultSchema.parse(res);
	}

	async verifyTotpChallenge(
		input: VerifyTotpChallengeInput
	): Promise<CompleteMfaChallengeResult> {
		const req = VerifyTotpChallengeInputSchema.parse(input);
		const res = await this.#client.verifyTOTPChallenge(req);
		return CompleteMfaChallengeResultSchema.parse(res);
	}

	async finishPasskeyChallenge(
		input: FinishPasskeyChallengeInput
	): Promise<CompleteMfaChallengeResult> {
		const req = FinishPasskeyChallengeInputSchema.parse(input);
		const res = await this.#client.finishPasskeyChallenge(req);
		return CompleteMfaChallengeResultSchema.parse(res);
	}

	async verifyRecoveryCodeChallenge(
		input: VerifyRecoveryCodeChallengeInput
	): Promise<CompleteMfaChallengeResult> {
		const req = VerifyRecoveryCodeChallengeInputSchema.parse(input);
		const res = await this.#client.verifyRecoveryCodeChallenge(req);
		return CompleteMfaChallengeResultSchema.parse(res);
	}

	async deleteFactor(input: DeleteMfaFactorInput): Promise<void> {
		const { factorId, stepUpToken } = DeleteMfaFactorInputSchema.parse(input);
		await this.#client.deleteMFAFactor(
			{ factorId },
			stepUpCallOptions(stepUpToken ?? undefined)
		);
	}

	async updateFactor(input: UpdateMfaFactorInput): Promise<UpdateMfaFactorResult> {
		const { factorId, label, stepUpToken } = UpdateMfaFactorInputSchema.parse(input);
		const res = await this.#client.updateMFAFactor(
			{ factorId, label },
			stepUpCallOptions(stepUpToken ?? undefined)
		);
		return UpdateMfaFactorResultSchema.parse(res);
	}

	async regenerateRecoveryCodes(
		input: RegenerateRecoveryCodesInput = {}
	): Promise<RegenerateRecoveryCodesResult> {
		const { stepUpToken } = RegenerateRecoveryCodesInputSchema.parse(input);
		const res = await this.#client.regenerateRecoveryCodes(
			{},
			stepUpCallOptions(stepUpToken ?? undefined)
		);
		return RegenerateRecoveryCodesResultSchema.parse(res);
	}

	async claimFreshStepUp(input: ClaimFreshStepUpInput): Promise<ClaimFreshStepUpResult> {
		const req = ClaimFreshStepUpInputSchema.parse(input);
		const res = await this.#client.claimFreshStepUp(req);
		return ClaimFreshStepUpResultSchema.parse(res);
	}

	async consumeFreshStepUp(input: ConsumeFreshStepUpInput): Promise<void> {
		const req = ConsumeFreshStepUpInputSchema.parse(input);
		await this.#client.consumeFreshStepUp(removeUndefined(req));
	}

	async releaseFreshStepUp(input: ReleaseFreshStepUpInput): Promise<void> {
		const req = ReleaseFreshStepUpInputSchema.parse(input);
		await this.#client.releaseFreshStepUp(removeUndefined(req));
	}
}
