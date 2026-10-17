import type { NewCaseAttachmentRow } from "@automationstack/db/repositories/case-attachments-repository";
import {
	CASE_STEP_SCREENSHOT_KEYS,
	type CaseStep,
	type CaseStepScreenshotKey,
} from "@automationstack/db/schema/test-cases";

import { MAX_NEW_CASE_ATTACHMENTS } from "../schemas/case";
import type { AttachmentObjectStore } from "./attachment-ingest";
import {
	type CaseAttachmentErrorThrowers,
	verifyUploadedCaseImage,
} from "./case-attachment-ingest";
import {
	readScreenshotUploadToken,
	SCREENSHOT_UPLOAD_TOKEN_TTL_HOURS,
	type ScreenshotUpload,
} from "./case-screenshot-upload-token";

/**
 * MCP 写用例步骤时，操作截图和预期截图中是上传凭证（uploadToken），不是附件 id。
 * 这里校验每个凭证，检查 R2 中的对象（HEAD），然后把凭证换成登记后的附件 id。
 */

const GROUP_LABELS: Record<CaseStepScreenshotKey, string> = {
	actionScreenshots: "操作截图",
	expectedScreenshots: "预期截图",
};

export const STORAGE_UNCONFIGURED_MESSAGE =
	"附件存储（R2）未配置，无法写入操作截图或预期截图";

const INVALID_TOKEN_MESSAGE =
	"截图上传凭证无效，请使用取得上传地址时返回的 uploadToken";

const EXPIRED_TOKEN_MESSAGE = `截图上传凭证已过期（签发后 ${SCREENSHOT_UPLOAD_TOKEN_TTL_HOURS} 小时内有效），请重新取得上传地址并上传`;

const FOREIGN_PROJECT_MESSAGE = "截图上传凭证属于另一个项目";

const MIXED_CASES_MESSAGE = "一条用例的截图上传凭证必须属于同一个用例";

const MISSING_FILE_MESSAGE =
	"截图文件不存在：上传没有完成，或上传地址已过期。请重新取得上传地址并上传";

export interface ScreenshotUploadContext {
	createdBy: string | null;
	now: number;
	projectId: string;
	secret: string;
	storage: AttachmentObjectStore | null;
}

export type ResolveStepScreenshotUploadsResult =
	| { kind: "none" }
	| { kind: "error"; message: string }
	| {
			attachments: NewCaseAttachmentRow[];
			/** 所有上传属于的用例。写入时这条用例必须是被写的用例。 */
			caseId: string;
			kind: "ok";
			steps: CaseStep[];
	  };

class UploadReferenceError extends Error {}

/** 每个凭证第一次出现的位置，按出现的顺序。 */
function tokenLocations(steps: readonly CaseStep[]): Map<string, string> {
	const locations = new Map<string, string>();
	for (const step of steps) {
		for (const key of CASE_STEP_SCREENSHOT_KEYS) {
			for (const token of step[key] ?? []) {
				if (!locations.has(token)) {
					locations.set(token, `步骤 ${step.id} 的${GROUP_LABELS[key]}`);
				}
			}
		}
	}
	return locations;
}

function failAt(location: string, message: string): never {
	throw new UploadReferenceError(`${location}：${message}`);
}

interface ReadUploads {
	/** 所有上传属于的用例。 */
	caseId: string;
	uploads: Map<string, ScreenshotUpload>;
}

async function readUploads(
	locations: Map<string, string>,
	context: ScreenshotUploadContext
): Promise<ReadUploads> {
	const uploads = new Map<string, ScreenshotUpload>();
	let caseId = "";
	for (const [token, location] of locations) {
		// biome-ignore lint/performance/noAwaitInLoops: 按出现的顺序报告第一个错误
		const read = await readScreenshotUploadToken(token, context);
		if (read.kind === "invalid") {
			failAt(location, INVALID_TOKEN_MESSAGE);
		}
		if (read.kind === "expired") {
			failAt(location, EXPIRED_TOKEN_MESSAGE);
		}
		if (read.upload.projectId !== context.projectId) {
			failAt(location, FOREIGN_PROJECT_MESSAGE);
		}
		caseId ||= read.upload.caseId;
		if (read.upload.caseId !== caseId) {
			failAt(location, MIXED_CASES_MESSAGE);
		}
		uploads.set(token, read.upload);
	}
	return { caseId, uploads };
}

function throwersAt(location: string): CaseAttachmentErrorThrowers {
	const toError = (options?: { message?: string }) =>
		new UploadReferenceError(`${location}：${options?.message ?? ""}`);
	return { BAD_REQUEST: toError, NOT_FOUND: toError };
}

function verifyUploads(
	uploads: Map<string, ScreenshotUpload>,
	locations: Map<string, string>,
	context: ScreenshotUploadContext & { storage: AttachmentObjectStore }
): Promise<NewCaseAttachmentRow[]> {
	return Promise.all(
		[...uploads].map(async ([token, upload]) => {
			const verified = await verifyUploadedCaseImage(
				{
					missingMessage: MISSING_FILE_MESSAGE,
					scope: { caseId: upload.caseId, projectId: upload.projectId },
					storage: context.storage,
					storageKey: upload.storageKey,
				},
				throwersAt(locations.get(token) ?? "")
			);
			return {
				...verified,
				createdBy: context.createdBy,
				fileName: upload.fileName,
				id: upload.attachmentId,
				storageKey: upload.storageKey,
			};
		})
	);
}

function replaceTokens(
	steps: readonly CaseStep[],
	uploads: Map<string, ScreenshotUpload>
): CaseStep[] {
	return steps.map((step) => {
		const replaced: CaseStep = { ...step };
		for (const key of CASE_STEP_SCREENSHOT_KEYS) {
			const tokens = step[key];
			if (tokens !== undefined) {
				replaced[key] = tokens.map(
					(token) => uploads.get(token)?.attachmentId ?? token
				);
			}
		}
		return replaced;
	});
}

function tooManyUploadsMessage(count: number): string {
	return `一条用例一次最多引用 ${MAX_NEW_CASE_ATTACHMENTS} 个截图上传凭证，这一行有 ${count} 个。请分几次写入：已经写入的步骤不给截图字段，截图保持不变`;
}

export async function resolveStepScreenshotUploads(
	steps: readonly CaseStep[],
	context: ScreenshotUploadContext
): Promise<ResolveStepScreenshotUploadsResult> {
	const locations = tokenLocations(steps);
	if (locations.size === 0) {
		return { kind: "none" };
	}
	if (locations.size > MAX_NEW_CASE_ATTACHMENTS) {
		return { kind: "error", message: tooManyUploadsMessage(locations.size) };
	}
	const { storage } = context;
	if (storage === null) {
		return { kind: "error", message: STORAGE_UNCONFIGURED_MESSAGE };
	}
	try {
		const { caseId, uploads } = await readUploads(locations, context);
		const attachments = await verifyUploads(uploads, locations, {
			...context,
			storage,
		});
		return {
			attachments,
			caseId,
			kind: "ok",
			steps: replaceTokens(steps, uploads),
		};
	} catch (error) {
		if (error instanceof UploadReferenceError) {
			return { kind: "error", message: error.message };
		}
		throw error;
	}
}
