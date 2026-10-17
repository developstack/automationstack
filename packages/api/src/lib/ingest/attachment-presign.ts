import { resolveAutomationTargets } from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import {
	type AttachmentScope,
	prepareRunAttachmentUploads,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";
import type { User } from "@automationstack/db/schema/users";

import {
	buildAttachmentStorageKey,
	UPLOAD_URL_TTL_SECONDS,
} from "../attachment-policy";
import { getR2Storage, type R2Storage } from "../r2";
import type {
	IngestAttachmentPresignReceipt,
	IngestAttachmentPresignRequest,
	IngestAttachmentRejection,
	IngestAttachmentUpload,
} from "./attachment-contract";
import {
	type AttachmentUploadGroup,
	type AttachmentUploadItem,
	buildGroupRejections,
	describeRunCaseVanished,
	describeRunUnwritable,
	type PlannedAttachmentUploads,
	planAttachmentUploads,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reconcile";
import { tokenCanEnterProject } from "./ingest-project-access";

export type IngestAttachmentPresignOutcome =
	| { kind: "forbidden" }
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestAttachmentPresignReceipt }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

function unconfiguredPresignReceipt(
	planned: PlannedAttachmentUploads
): IngestAttachmentPresignReceipt {
	const sourceRefByIndex = new Map<number, string>();
	for (const group of planned.groups) {
		for (const item of group.items) {
			sourceRefByIndex.set(item.index, item.sourceRef);
		}
	}
	const rejected = [
		...planned.rejected,
		...[...sourceRefByIndex].map(([index, sourceRef]) => ({
			index,
			reason: REASON_STORAGE_UNCONFIGURED,
			runName: null,
			sourceRef,
		})),
	];
	return {
		expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
		rejected: rejected.sort((left, right) => left.index - right.index),
		storageConfigured: false,
		uploads: [],
	};
}

interface SignedGroup {
	rejected: IngestAttachmentRejection[];
	uploads: IngestAttachmentUpload[];
}

interface SignableSplit {
	rejected: IngestAttachmentRejection[];
	signable: { item: AttachmentUploadItem; scope: AttachmentScope }[];
}

function splitSignableItems(
	group: AttachmentUploadGroup,
	scopeByRunCaseId: Map<string, AttachmentScope>
): SignableSplit {
	const rejected: IngestAttachmentRejection[] = [];
	const signable: SignableSplit["signable"] = [];
	for (const item of group.items) {
		const scope = scopeByRunCaseId.get(item.runCaseId);
		if (scope === undefined) {
			rejected.push({
				index: item.index,
				reason: describeRunCaseVanished(group.runName),
				runName: group.runName,
				sourceRef: item.sourceRef,
			});
			continue;
		}
		signable.push({ item, scope });
	}
	return { rejected, signable };
}

async function signGroup(
	group: AttachmentUploadGroup,
	storage: R2Storage
): Promise<SignedGroup> {
	const prepared = await prepareRunAttachmentUploads({
		runCaseIds: group.items.map((item) => item.runCaseId),
		runId: group.runId,
	});
	if (prepared.kind !== "ok") {
		return {
			rejected: buildGroupRejections(
				group,
				describeRunUnwritable(prepared, group.runName)
			),
			uploads: [],
		};
	}
	const scopeByRunCaseId = new Map<string, AttachmentScope>(
		prepared.scopes.map((scope) => [scope.runCaseId, scope] as const)
	);
	const { rejected, signable } = splitSignableItems(group, scopeByRunCaseId);
	const uploads = await Promise.all(
		signable.map(async ({ item, scope }) => {
			const storageKey = buildAttachmentStorageKey(scope, item);
			return {
				contentType: item.contentType,
				index: item.index,
				runCaseId: item.runCaseId,
				runId: group.runId,
				runName: group.runName,
				sourceRef: item.sourceRef,
				storageKey,
				uploadUrl: await storage.presignUpload(storageKey, {
					contentLength: item.sizeBytes,
					contentType: item.contentType,
				}),
			};
		})
	);
	return { rejected, uploads };
}

export async function presignParsed(
	request: IngestAttachmentPresignRequest,
	user: User
): Promise<IngestAttachmentPresignOutcome> {
	if (!(await projectExists(request.projectId))) {
		return { kind: "project-not-found" };
	}
	if (!(await tokenCanEnterProject(user, request.projectId))) {
		return { kind: "forbidden" };
	}
	await settleAutoSubmitForProject(request.projectId);
	const rows = await resolveAutomationTargets({
		projectId: request.projectId,
		sourceRefs: [
			...new Set(request.attachments.map((attachment) => attachment.sourceRef)),
		],
	});
	const planned = planAttachmentUploads({
		attachments: request.attachments,
		rows,
		runIds: request.runIds,
	});
	const storage = getR2Storage();
	if (storage === null) {
		return { kind: "ok", receipt: unconfiguredPresignReceipt(planned) };
	}
	const rejected = [...planned.rejected];
	const uploads: IngestAttachmentUpload[] = [];
	for (const group of planned.groups) {
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个事务，必须串行抢行锁，见上
		const signed = await signGroup(group, storage);
		rejected.push(...signed.rejected);
		uploads.push(...signed.uploads);
	}
	return {
		kind: "ok",
		receipt: {
			expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
			rejected,
			storageConfigured: true,
			uploads,
		},
	};
}
