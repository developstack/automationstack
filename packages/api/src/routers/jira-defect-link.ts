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

/**
 * `jira.linkDefect` 的主体（W4 反向关联）。
 *
 * 与 `./jira-defect-create.ts` 同一种拆法、同一个理由：router 里只留声明，
 * 编排搬到模块顶层的具名函数。两条链路各占一个文件而不是合成一个
 * `jira-defect-handlers.ts`——它们唯一共享的只有「写回 + 发失效事件」那三行，
 * 而各自的守卫、各自的降级分支、各自的错误码清单没有一处重合。
 */

/** 见 `./jira-defect-create.ts` 里同名常量的注释：码表跟着实现走。 */
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

/**
 * 配了 Jira 的项目：先从粘贴的东西里认出 key，再去 Jira 确认它真的存在。
 *
 * 「Jira 上没有这条 issue」单独用 NOT_FOUND 而不是并进 BAD_GATEWAY：
 * 前者是用户粘错了（他自己能改），后者是 Jira 那边出了事（他改不了）。
 */
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

/**
 * 降级：只存 URL 原文。`defectKey` 保持 null——它的语义是
 * 「Jira 侧的 issue」，未配置的项目没有可校验的 Jira，
 * 存进去只会让后续的状态同步以为有得可同步。
 */
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
	// **未配置 Jira 时一个外部请求都不发**（D9）：这条降级分支必须先于任何
	// Jira 调用判断，否则没配 Jira 的项目手填个链接也会等一次超时。
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
