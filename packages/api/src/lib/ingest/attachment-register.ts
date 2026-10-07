import {
	type AttachmentScope,
	prepareRunAttachmentUploads,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import type { User } from "@automationstack/db/schema/users";

import type { RealtimeActor } from "../../realtime/protocol";
import { getR2Storage, type R2Storage } from "../r2";
import { publishInvalidateAs } from "../realtime-publish";
import type {
	IngestAttachmentRegistered,
	IngestAttachmentRegisterReceipt,
	IngestAttachmentRegisterRejection,
	IngestAttachmentRegisterRequest,
} from "./attachment-contract";
import {
	type AttachmentRegisterGroup,
	buildRegisterRejections,
	describeRunCaseVanished,
	describeRunUnwritable,
	groupRegisterItemsByRunId,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reconcile";
import { type RegisterOne, registerOne } from "./attachment-register-one";
import { splitRegisterGroupsByAccess } from "./attachment-register-scope";
import { forbiddenRunIds } from "./ingest-project-access";

export type IngestAttachmentRegisterOutcome =
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestAttachmentRegisterReceipt }
	| { kind: "unauthorized" };

function attachmentIngestActor(user: User): RealtimeActor {
	return { clientId: "automation-ingest", name: user.username };
}

function unconfiguredRegisterReceipt(
	request: IngestAttachmentRegisterRequest
): IngestAttachmentRegisterReceipt {
	return {
		registered: [],
		rejected: request.attachments.map((item, index) => ({
			index,
			reason: REASON_STORAGE_UNCONFIGURED,
			runCaseId: item.runCaseId,
			storageKey: item.storageKey,
		})),
		storageConfigured: false,
	};
}

const REGISTER_CONCURRENCY = 8;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		chunks.push(items.slice(start, start + size));
	}
	return chunks;
}

interface RegisteredGroup {
	projectId: string | null;
	registered: IngestAttachmentRegistered[];
	rejected: IngestAttachmentRegisterRejection[];
}

interface PendingSplit {
	pending: RegisterOne[];
	rejected: IngestAttachmentRegisterRejection[];
}

function splitRegisterPending(
	group: AttachmentRegisterGroup,
	scopeByRunCaseId: Map<string, AttachmentScope>,
	storage: R2Storage,
	userId: string
): PendingSplit {
	const pending: RegisterOne[] = [];
	const rejected: IngestAttachmentRegisterRejection[] = [];
	for (const item of group.items) {
		const scope = scopeByRunCaseId.get(item.runCaseId);
		if (scope === undefined) {
			rejected.push(
				...buildRegisterRejections([item], describeRunCaseVanished(null))
			);
			continue;
		}
		pending.push({ item, scope, storage, userId });
	}
	return { pending, rejected };
}

async function registerGroup(
	group: AttachmentRegisterGroup,
	storage: R2Storage,
	userId: string
): Promise<RegisteredGroup> {
	const prepared = await prepareRunAttachmentUploads({
		runCaseIds: group.items.map((item) => item.runCaseId),
		runId: group.runId,
	});
	if (prepared.kind !== "ok") {
		return {
			projectId: null,
			registered: [],
			rejected: buildRegisterRejections(
				group.items,
				describeRunUnwritable(prepared, null)
			),
		};
	}
	const scopeByRunCaseId = new Map<string, AttachmentScope>(
		prepared.scopes.map((scope) => [scope.runCaseId, scope] as const)
	);
	const { pending, rejected } = splitRegisterPending(
		group,
		scopeByRunCaseId,
		storage,
		userId
	);
	const registered: IngestAttachmentRegistered[] = [];
	for (const batch of chunk(pending, REGISTER_CONCURRENCY)) {
		// biome-ignore lint/performance/noAwaitInLoops: 分批是为了限并发，见 REGISTER_CONCURRENCY
		const outcomes = await Promise.all(batch.map(registerOne));
		for (const outcome of outcomes) {
			if (outcome.kind === "registered") {
				registered.push(outcome.attachment);
				continue;
			}
			rejected.push(outcome.rejection);
		}
	}
	return {
		projectId: prepared.scopes[0]?.projectId ?? null,
		registered,
		rejected,
	};
}

export async function registerParsed(
	request: IngestAttachmentRegisterRequest,
	user: User
): Promise<IngestAttachmentRegisterOutcome> {
	const storage = getR2Storage();
	if (storage === null) {
		return { kind: "ok", receipt: unconfiguredRegisterReceipt(request) };
	}
	const actor = attachmentIngestActor(user);
	const registered: IngestAttachmentRegistered[] = [];
	const scope = splitRegisterGroupsByAccess(
		groupRegisterItemsByRunId(request.attachments),
		await forbiddenRunIds(
			user,
			request.attachments.map((attachment) => attachment.runId)
		)
	);
	const rejected: IngestAttachmentRegisterRejection[] = [...scope.rejected];
	for (const group of scope.allowed) {
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个守卫事务，串行抢行锁，同 signGroup
		const outcome = await registerGroup(group, storage, user.id);
		registered.push(...outcome.registered);
		rejected.push(...outcome.rejected);
		if (outcome.projectId === null || outcome.registered.length === 0) {
			continue;
		}
		publishInvalidateAs({
			action: "update",
			actor,
			entity: "testRun",
			ids: [group.runId],
			projectId: outcome.projectId,
		});
	}
	return {
		kind: "ok",
		receipt: { registered, rejected, storageConfigured: true },
	};
}
