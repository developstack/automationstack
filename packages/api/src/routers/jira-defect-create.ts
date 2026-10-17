import {
	type DefectContext,
	getDefectContext,
} from "@automationstack/db/repositories/jira-repository";
import { setRunCaseDefect } from "@automationstack/db/repositories/test-run-defects-repository";
import type { ORPCErrorConstructorMap } from "@orpc/server";

import type { Context } from "../context";
import { buildDefectDescription, buildDefectSummary } from "../lib/jira/adf";
import type { JiraClient, JiraIssueRef } from "../lib/jira/client";
import {
	buildRunUrl,
	type DefectLinkView,
	readFreshStatus,
} from "../lib/jira/defect-link";
import { describeJiraFailure } from "../lib/jira/failure";
import { resolveJiraClient } from "../lib/jira/get-client";
import { publishInvalidate } from "../lib/realtime-publish";
import { rejectedWriteMessage, runLockMessage } from "../lib/test-run-errors";

export const createDefectErrorMap = {
	BAD_GATEWAY: {},
	CONFLICT: {},
	NOT_FOUND: {},
	PRECONDITION_FAILED: {},
};

type CreateDefectErrors = ORPCErrorConstructorMap<typeof createDefectErrorMap>;

export interface CreateDefectOptions {
	context: Context;
	errors: CreateDefectErrors;
	input: { runCaseId: string };
}

function requireCreatableContext(
	defect: DefectContext | null,
	errors: CreateDefectErrors
): DefectContext {
	if (defect === null) {
		throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
	}
	const lockMessage = runLockMessage(defect);
	if (lockMessage !== null) {
		throw errors.CONFLICT({ message: lockMessage });
	}
	if (defect.defectKey !== null) {
		throw errors.CONFLICT({
			message: `该用例已关联 ${defect.defectKey}，请先解除关联再创建新的 issue`,
		});
	}
	return defect;
}

async function requireJiraClient(
	projectId: string,
	errors: CreateDefectErrors
): Promise<JiraClient> {
	const resolution = await resolveJiraClient(projectId);
	if (resolution.kind !== "ok") {
		throw errors.PRECONDITION_FAILED({
			message:
				resolution.kind === "unconfigured"
					? "本项目未配置 Jira，请在项目设置里配置后再试，或直接手填缺陷链接"
					: "Jira 凭据当前不可用，请在项目设置里重新填写 API Token",
		});
	}
	return resolution.client;
}

async function createIssueForDefect(
	client: JiraClient,
	defect: DefectContext,
	summary: string,
	errors: CreateDefectErrors
): Promise<JiraIssueRef> {
	const created = await client.createIssue({
		description: buildDefectDescription({
			attachmentCount: defect.attachmentCount,
			caseName: defect.caseName,
			comment: defect.comment,
			preconditions: defect.casePreconditions,
			runName: defect.runName,
			runUrl: buildRunUrl(defect.projectId, defect.runId),
			steps: defect.caseSteps,
		}),
		issueType: client.defaultIssueType,
		summary,
	});
	if (!created.ok) {
		throw errors.BAD_GATEWAY({
			message: describeJiraFailure(created.failure),
		});
	}
	return created.value;
}

export async function handleCreateDefect(
	options: CreateDefectOptions
): Promise<DefectLinkView> {
	const { context, errors, input } = options;
	const defect = requireCreatableContext(
		await getDefectContext(input.runCaseId),
		errors
	);
	const client = await requireJiraClient(defect.projectId, errors);
	const summary = buildDefectSummary({
		caseName: defect.caseName,
		runName: defect.runName,
	});
	const created = await createIssueForDefect(client, defect, summary, errors);
	const view: DefectLinkView = {
		defectKey: created.key,
		defectStatus: await readFreshStatus(client, created.key),
		defectTitle: summary,
		defectUrl: created.url,
	};
	const written = await setRunCaseDefect(input.runCaseId, view);
	if (written.kind !== "ok") {
		const reason =
			written.kind === "not-found"
				? "用例执行记录已不存在"
				: rejectedWriteMessage(written);
		throw errors.CONFLICT({
			message: `${reason}；刚创建的 ${created.key} 需要手工处理`,
		});
	}
	publishInvalidate({
		action: "update",
		context,
		entity: "testRun",
		ids: [defect.runId],
		projectId: defect.projectId,
	});
	return view;
}
