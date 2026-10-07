import { resolveUserFromBearer } from "../../auth/bearer";
import {
	ingestAttachmentPresignRequestSchema,
	ingestAttachmentRegisterRequestSchema,
} from "./attachment-contract";
import {
	type IngestAttachmentPresignOutcome,
	presignParsed,
} from "./attachment-presign";
import {
	type IngestAttachmentRegisterOutcome,
	registerParsed,
} from "./attachment-register";
import { formatIngestIssues } from "./format-issues";

export type { IngestAttachmentPresignOutcome } from "./attachment-presign";
export type { IngestAttachmentRegisterOutcome } from "./attachment-register";

export interface HandleIngestAttachmentPresignInput {
	authorizationHeader: string | null;
	body: unknown;
}

export async function handleIngestAttachmentPresign(
	input: HandleIngestAttachmentPresignInput
): Promise<IngestAttachmentPresignOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestAttachmentPresignRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	return await presignParsed(parsed.data, user);
}

export interface HandleIngestAttachmentRegisterInput {
	authorizationHeader: string | null;
	body: unknown;
}

export async function handleIngestAttachmentRegister(
	input: HandleIngestAttachmentRegisterInput
): Promise<IngestAttachmentRegisterOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestAttachmentRegisterRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	return await registerParsed(parsed.data, user);
}
