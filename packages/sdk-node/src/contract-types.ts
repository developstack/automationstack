export type AutomationCaseResult = "blocked" | "failed" | "passed" | "skipped";

export type AttachmentKind = "log" | "other" | "screenshot" | "video";

export interface IngestExecutionResultWire {
	durationMs?: number | null;
	message?: string | null;
	result: AutomationCaseResult;
	sourceRef: string;
}

export interface IngestExecutionRequestWire {
	branch?: string | null;
	ciUrl?: string | null;
	commitSha?: string | null;
	finishedAt?: string | null;
	idempotencyKey: string;
	overwriteManual?: boolean;
	projectId: string;
	results: IngestExecutionResultWire[];
	runIds?: string[] | null;
	startedAt?: string | null;
}

export interface IngestWrittenToEntry {
	runId: string;
	runName: string;
	updated: number;
}

export interface IngestSkippedManualEntry {
	reason: string;
	runName: string;
	sourceRef: string;
}

export interface IngestUnmatchedCaseEntry {
	reason: string;
	sourceRef: string;
}

export interface IngestOutOfScopeEntry {
	caseId: string;
	reason: string;
	runName: string | null;
	sourceRef: string;
}

export interface IngestExecutionReceipt {
	executionId: string;
	outOfScope: IngestOutOfScopeEntry[];
	skippedManual: IngestSkippedManualEntry[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
	writtenTo: IngestWrittenToEntry[];
}

export interface IngestAttachmentPresignItemWire {
	contentType: string;
	kind: AttachmentKind;
	sizeBytes: number;
	sourceRef: string;
}

export interface IngestAttachmentPresignRequestWire {
	attachments: IngestAttachmentPresignItemWire[];
	projectId: string;
	runIds?: string[] | null;
}

export interface IngestAttachmentUpload {
	contentType: string;
	index: number;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	storageKey: string;
	uploadUrl: string;
}

export interface IngestAttachmentRejection {
	index: number;
	reason: string;
	runName: string | null;
	sourceRef: string;
}

export interface IngestAttachmentPresignReceipt {
	expiresInSeconds: number;
	rejected: IngestAttachmentRejection[];
	storageConfigured: boolean;
	uploads: IngestAttachmentUpload[];
}

export interface IngestAttachmentRegisterItemWire {
	fileName: string;
	kind: AttachmentKind;
	runCaseId: string;
	runId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterRequestWire {
	attachments: IngestAttachmentRegisterItemWire[];
}

export interface IngestAttachmentRegistered {
	attachmentId: string;
	index: number;
	runCaseId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterRejection {
	index: number;
	reason: string;
	runCaseId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterReceipt {
	registered: IngestAttachmentRegistered[];
	rejected: IngestAttachmentRegisterRejection[];
	storageConfigured: boolean;
}
