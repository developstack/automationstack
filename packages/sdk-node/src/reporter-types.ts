import type { AttachmentKind, AutomationCaseResult } from "./contract-types.js";

export interface CaseResultInput {
	durationMs?: number | null;
	message?: string | null;
	result: AutomationCaseResult;
	sourceRef: string;
}

export interface AttachmentInput {
	body?: Uint8Array;
	contentType?: string;
	fileName?: string;
	filePath?: string;
	kind: AttachmentKind;
	sourceRef: string;
}

export interface LoadedAttachment {
	body: Uint8Array;
	contentType: string;
	fileName: string;
	kind: AttachmentKind;
	sizeBytes: number;
	sourceRef: string;
}

export interface AttachmentOutcome {
	registered: number;
	rejections: string[];
	storageConfigured: boolean;
	uploaded: number;
}
