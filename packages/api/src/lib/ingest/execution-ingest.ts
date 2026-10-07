import {
	completeAutomationExecution,
	type EnsureAutomationExecutionResult,
	ensureAutomationExecution,
	resolveAutomationTargets,
} from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";
import type { User } from "@automationstack/db/schema/users";

import { resolveUserFromBearer } from "../../auth/bearer";
import {
	type IngestExecutionReceipt,
	type IngestExecutionRequest,
	ingestExecutionRequestSchema,
} from "./execution-contract";
import { buildReceipt, cachedReceipt } from "./execution-receipt";
import {
	buildCaseIdBySourceRef,
	findDuplicateSourceRefs,
	reconcileAutomationTargets,
} from "./execution-reconcile";
import { ingestActor, writeGroups } from "./execution-verdict-writer";
import { formatIngestIssues } from "./format-issues";
import { tokenCanEnterProject } from "./ingest-project-access";

export type IngestExecutionOutcome =
	| { kind: "duplicate-source-refs"; sourceRefs: string[] }
	| { kind: "forbidden" }
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestExecutionReceipt }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

export interface HandleIngestExecutionInput {
	authorizationHeader: string | null;
	body: unknown;
}

function ensureExecutionRow(
	request: IngestExecutionRequest,
	user: User
): Promise<EnsureAutomationExecutionResult> {
	return ensureAutomationExecution({
		branch: request.branch,
		ciUrl: request.ciUrl,
		commitSha: request.commitSha,
		finishedAt: request.finishedAt,
		idempotencyKey: request.idempotencyKey,
		projectId: request.projectId,
		reportedBy: user.id,
		startedAt: request.startedAt,
	});
}

async function completeExecution(
	executionId: string,
	receipt: IngestExecutionReceipt
): Promise<void> {
	const updatedCount = receipt.writtenTo.reduce(
		(total, entry) => total + entry.updated,
		0
	);
	await completeAutomationExecution({
		id: executionId,
		receipt,
		skippedCount: receipt.skippedManual.length,
		updatedCount,
	});
}

async function ingestParsedExecution(
	request: IngestExecutionRequest,
	user: User
): Promise<IngestExecutionOutcome> {
	if (!(await projectExists(request.projectId))) {
		return { kind: "project-not-found" };
	}
	if (!(await tokenCanEnterProject(user, request.projectId))) {
		return { kind: "forbidden" };
	}
	await settleAutoSubmitForProject(request.projectId);
	const ensured = await ensureExecutionRow(request, user);
	const { execution } = ensured;
	if (ensured.kind === "existing" && execution.completedAt !== null) {
		return { kind: "ok", receipt: await cachedReceipt(execution) };
	}
	const rows = await resolveAutomationTargets({
		projectId: request.projectId,
		sourceRefs: request.results.map((result) => result.sourceRef),
	});
	const reconciled = reconcileAutomationTargets({
		results: request.results,
		rows,
		runIds: request.runIds,
	});
	const written = await writeGroups({
		actor: ingestActor(user),
		caseIdBySourceRef: buildCaseIdBySourceRef(rows),
		executionId: execution.id,
		groups: reconciled.groups,
		overwriteManual: request.overwriteManual,
		projectId: request.projectId,
		userId: user.id,
	});
	const receipt = await buildReceipt({
		executionId: execution.id,
		projectId: request.projectId,
		reconciled,
		written,
	});
	await completeExecution(execution.id, receipt);
	return { kind: "ok", receipt };
}

export async function handleIngestExecution(
	input: HandleIngestExecutionInput
): Promise<IngestExecutionOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestExecutionRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	const duplicated = findDuplicateSourceRefs(parsed.data.results);
	if (duplicated.length > 0) {
		return { kind: "duplicate-source-refs", sourceRefs: duplicated };
	}
	return await ingestParsedExecution(parsed.data, user);
}

// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面，见上
export {
	type HandleIngestRunsInput,
	handleIngestRuns,
	type IngestRunsOutcome,
} from "./execution-runs-preflight";
