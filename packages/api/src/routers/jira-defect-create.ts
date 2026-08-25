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

/**
 * `jira.createDefect` 的主体（W4 正向创建）。
 *
 * 从 `./jira-defects.ts` 的 handler 闭包里搬出来成模块顶层的具名函数，
 * 与 `../lib/ingest/` 下那几个编排文件是同一种做法：router 那边只剩
 * 「哪个过程、收什么、抛哪些码」的声明，这边才是「先干什么后干什么」。
 * 一个 handler 长到七十行时，那两件事是混着读的。
 *
 * 这里仍然拿着 oRPC 的 `errors`（而不是折算成一个 outcome 联合体再由 router
 * 翻译）：整段编排的价值恰恰在于**在哪一步用哪个错误码止损**——
 * 建单前是 CONFLICT，建单后关联失败还是 CONFLICT 但话不一样。
 * 多加一层翻译，读代码的人就得跳两个文件才知道用户到底看到什么。
 */

/**
 * 错误码清单与实现放在一起，由 `./jira-defects.ts` 的 `.errors()` 引用同一个
 * 常量：handler 主体既然搬出了 router，「它会抛哪些码」的声明就得跟着它走。
 * 两处各写一份的话，这边删掉一个分支，router 上那条声明不会有任何编译错误。
 */
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

/**
 * 建单前的三道预检。
 *
 * 后两道**不是权威守卫**（权威守卫在 `setRunCaseDefect` 的事务里），只是不想在
 * 必定被拒的路径上先去 Jira 建一个没人关联的孤儿 issue——外部副作用不可回滚。
 * 理由详见 jira-repository 的 `DefectContext` 注释。
 */
function requireCreatableContext(
	defect: DefectContext | null,
	errors: CreateDefectErrors
): DefectContext {
	if (defect === null) {
		throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
	}
	if (defect.submittedAt !== null) {
		throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
	}
	if (defect.defectKey !== null) {
		throw errors.CONFLICT({
			message: `该用例已关联 ${defect.defectKey}，请先解除关联再创建新的 issue`,
		});
	}
	return defect;
}

/** 未配置 / 凭据解不开都走 PRECONDITION_FAILED，但话不一样：能修的动作不同。 */
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

/** 组装描述并建单；Jira 侧失败一律 BAD_GATEWAY——那不是用户能修的东西。 */
async function createIssueForDefect(
	client: JiraClient,
	defect: DefectContext,
	summary: string,
	errors: CreateDefectErrors
): Promise<JiraIssueRef> {
	// 附件：**故意只写数量 + 一条回平台的链接，不写 R2 链接**，这不是漏了。
	// R2 是预签名 URL，15 分钟就过期；写进 issue 描述里的链接第二天必然是
	// 死链，dev 点开打不开会以为是我们平台坏了——比不写更糟。
	//
	// 正确做法是把截图传成**真正的 Jira 附件**
	// （`POST /rest/api/3/issue/{key}/attachments`，带 `X-Atlassian-Token: no-check`），
	// 字节从 R2 取、经服务端转发。本期不做：这么一转，字节就要过我们的
	// 服务器，正好抵消掉 R2 预签名直传「不过应用服务器」的设计目的，
	// 20MB 量级的录屏尤其难受。
	//
	// 将来要做的话，边界已经定了：**只传图片类附件**（截图小，而且正是
	// dev 最需要的东西），录屏与日志一律仍旧只给回平台的链接。
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
		// issue 已经建出来了但关联不上（竞态窗口里测试任务刚被提交，或记录刚被删）。
		// 把 key 报给用户，否则那个 issue 就成了没人知道的孤儿。
		throw errors.CONFLICT({
			message:
				written.kind === "locked"
					? `该测试任务已提交并锁定，不可修改；刚创建的 ${created.key} 需要手工处理`
					: `用例执行记录已不存在；刚创建的 ${created.key} 需要手工处理`,
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
