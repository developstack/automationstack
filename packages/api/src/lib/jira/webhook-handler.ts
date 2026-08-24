import { getJiraConfig } from "@automationstack/db/repositories/jira-repository";
import { updateDefectStatusByIssueKey } from "@automationstack/db/repositories/test-run-defects-repository";

import { realtimeBus } from "../../realtime/bus";
import type { RealtimeActor } from "../../realtime/protocol";
import { parseJiraWebhookPayload, verifyJiraWebhook } from "./webhook";

/**
 * webhook 没有会话，也没有 oRPC 的 `Context`，所以这里直接用总线而不是
 * `publishInvalidate`。actor 用一个固定的假 clientId：真实客户端的 clientId
 * 是每个 Tab 一个 uuid，不会与之相同，因此没有任何在线客户端会把这条事件
 * 当成「自己触发的」而跳过刷新——正是我们要的效果（触发者是 Jira，不是人）。
 */
const JIRA_ACTOR: RealtimeActor = { clientId: "jira-webhook", name: "Jira" };

/**
 * Jira webhook 的编排层：校验 → 解析 → 落库。
 *
 * 放在 `packages/api` 而不是 `apps/server`，是为了让 HTTP 层只剩「取头、
 * 取原始体、把类型化结果映射成状态码」这点纯搬运工作；同时也保证 SQL 全在
 * `packages/db/src/repositories/` 里（本文件只调 repository 函数）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ **这里是「已提交的测试任务一切冻结」的唯一例外，不是漏洞，别把它「修」掉。**
 *
 * `submitted` 之后所有写操作都要拒绝（plan §2.5），唯独 `defectStatus` 仍由
 * webhook 继续更新，因此下面调的是 `updateDefectStatusByIssueKey`——
 * 它**故意**绕过 submitted 守卫，而不是 `setRunCaseDefect`（含守卫）。
 *
 * 理由：`defectStatus` 记的是**外部系统此刻的事实**（那个 issue 关没关），
 * 不是这个测试任务的测试结论。测试结论必须冻结，否则交出去的报告事后能被改数；
 * 但外部事实冻结只会让报告显示过期信息。三个月后打开一个已锁死的测试任务，
 * 需要看到「当时失败的 8 条里有 6 条 Jira 已经解决」才能判断该不该开重测任务
 * （D11 的重测任务入口正是靠这个状态过滤的）。把它一起冻住，这个测试任务就变成
 * 一份没人再打开的死数据。
 *
 * 判据很简单：**这个测试任务的人写的东西冻结，外部系统写的事实不冻结。**
 * 除 `defectStatus` 外没有第二个字段符合这个判据——`defectKey` / `defectUrl`
 * 是「关联到哪个 issue」，那是人的决定，照常冻结。
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * 处理结果。`unauthorized` 与 `unconfigured` 在类型上分开是给服务端日志看的，
 * HTTP 层要把两者映射成**同一个** 401：否则这个端点就成了「哪些项目配了 Jira」
 * 的探测器——它没有会话，任何人都能拿 projectId 来问。
 */
export type JiraWebhookOutcome =
	| { kind: "ignored" }
	| { kind: "invalid-payload" }
	| { kind: "synced"; issueKey: string; status: string }
	| { kind: "unauthorized" }
	| { kind: "unconfigured" };

export interface HandleJiraWebhookInput {
	projectId: string;
	/** 原始请求体字符串；HMAC 必须对它算，不能对重新序列化的结果算。 */
	rawBody: string;
	secretHeader: string | null;
	signatureHeader: string | null;
}

export async function handleJiraWebhook(
	input: HandleJiraWebhookInput
): Promise<JiraWebhookOutcome> {
	const config = await getJiraConfig(input.projectId);
	if (config === null) {
		return { kind: "unconfigured" };
	}
	// 校验在解析之前：签名是对原始字节算的，而且没通过校验的请求体连
	// JSON.parse 都不该喂给它。校验失败直接拒绝，不做任何「宽容处理」。
	const authorized = await verifyJiraWebhook({
		rawBody: input.rawBody,
		secret: config.webhookSecret,
		secretHeader: input.secretHeader,
		signatureHeader: input.signatureHeader,
	});
	if (!authorized) {
		return { kind: "unauthorized" };
	}
	let payload: unknown;
	try {
		payload = JSON.parse(input.rawBody);
	} catch {
		return { kind: "invalid-payload" };
	}
	const event = parseJiraWebhookPayload(payload);
	if (event.kind !== "status") {
		return event.kind === "ignored"
			? { kind: "ignored" }
			: { kind: "invalid-payload" };
	}
	// 按 (projectId, issueKey) 更新：同一个 issue 可能被多个测试任务的多条用例
	// 关联（回归重测任务尤其常见），它们的 defectStatus 说的是同一件事，
	// 一起更新才不会出现「A 任务显示已解决、B 任务还显示进行中」。
	const touched = await updateDefectStatusByIssueKey(
		input.projectId,
		event.issueKey,
		event.status
	);
	// 同一个 issue 可能命中同一个测试任务里的多条用例，按 runId 去重后再发事件。
	const runIds = [...new Set(touched.map((row) => row.runId))];
	if (runIds.length > 0) {
		realtimeBus.publish(input.projectId, {
			action: "update",
			actor: JIRA_ACTOR,
			entity: "testRun",
			ids: runIds,
		});
	}
	return { issueKey: event.issueKey, kind: "synced", status: event.status };
}
