import { getDefectContext } from "@automationstack/db/repositories/jira-repository";
import { setRunCaseDefect } from "@automationstack/db/repositories/test-run-defects-repository";
import type { ORPCErrorConstructorMap } from "@orpc/server";

import type { Context } from "../context";
import type { JiraClient } from "../lib/jira/client";
import {
	type DefectLinkView,
	normalizeExternalUrl,
} from "../lib/jira/defect-link";
import { describeJiraFailure } from "../lib/jira/failure";
import { resolveJiraClient } from "../lib/jira/get-client";
import { parseIssueKey } from "../lib/jira/issue-key";
import { publishInvalidate } from "../lib/realtime-publish";

export const linkDefectErrorMap = {
	BAD_GATEWAY: {},
	BAD_REQUEST: {},
	CONFLICT: {},
	NOT_FOUND: {},
};

type LinkDefectErrors = ORPCErrorConstructorMap<typeof linkDefectErrorMap>;

export interface LinkDefectOptions {
	context: Context;
	errors: LinkDefectErrors;
	input: { reference: string; runCaseId: string };
}

async function viewFromJiraIssue(
	client: JiraClient,
	reference: string,
	errors: LinkDefectErrors
): Promise<DefectLinkView> {
	const issueKey = parseIssueKey(reference);
	if (issueKey === null) {
		throw errors.BAD_REQUEST({
			message: "认不出 issue 编号，请粘贴 issue 链接或形如 PAY-123 的编号",
		});
	}
	const issue = await client.getIssue(issueKey);
	if (!issue.ok) {
		const message = describeJiraFailure(issue.failure);
		if (issue.failure.kind === "not-found") {
			throw errors.NOT_FOUND({ message: `Jira 上没有 ${issueKey}` });
		}
		throw errors.BAD_GATEWAY({ message });
	}
	return {
		defectKey: issue.value.key,
		defectStatus: issue.value.status,
		defectTitle: issue.value.summary,
		defectUrl: issue.value.url,
	};
}

function viewFromExternalUrl(
	reference: string,
	errors: LinkDefectErrors
): DefectLinkView {
	const url = normalizeExternalUrl(reference);
	if (url === null) {
		throw errors.BAD_REQUEST({
			message:
				"本项目未配置 Jira，请粘贴完整的缺陷链接（以 http:// 或 https:// 开头）",
		});
	}
	return {
		defectKey: null,
		defectStatus: null,
		defectTitle: null,
		defectUrl: url,
	};
}

export async function handleLinkDefect(
	options: LinkDefectOptions
): Promise<DefectLinkView> {
	const { context, errors, input } = options;
	const defect = await getDefectContext(input.runCaseId);
	if (defect === null) {
		throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
	}
	if (defect.submittedAt !== null) {
		throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
	}
	const resolution = await resolveJiraClient(defect.projectId);
	const view =
		resolution.kind === "ok"
			? await viewFromJiraIssue(resolution.client, input.reference, errors)
			: viewFromExternalUrl(input.reference, errors);
	const written = await setRunCaseDefect(input.runCaseId, view);
	if (written.kind !== "ok") {
		throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
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
