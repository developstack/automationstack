import { getDefectContext } from "@automationstack/db/repositories/jira-repository";
import {
	setRunCaseDefect,
	updateDefectStatusByIssueKey,
} from "@automationstack/db/repositories/test-run-defects-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { buildDefectDescription, buildDefectSummary } from "../lib/jira/adf";
import {
	buildRunUrl,
	type DefectLinkView,
	normalizeExternalUrl,
	readFreshStatus,
} from "../lib/jira/defect-link";
import { describeJiraFailure } from "../lib/jira/failure";
import { resolveJiraClient } from "../lib/jira/get-client";
import { parseIssueKey } from "../lib/jira/issue-key";
import { publishInvalidate } from "../lib/realtime-publish";
import { defectReferenceSchema } from "../schemas/jira";

const runCaseIdSchema = z.object({ runCaseId: z.uuid() });

/**
 * 缺陷联动的四个接口（W4）：正向创建 issue、反向关联已有 issue、解除关联、
 * 主动拉一次状态。
 *
 * 与 `jira.ts` 里的配置管理分开，是因为两者的失败面完全不同：配置管理只碰
 * 本地那一行配置，这里每一个接口都要**发外部请求**，于是通篇都在处理
 * 「Jira 侧成功了但本地没写上」这类不可回滚的中间态（见 `createDefect` 里
 * 建单成功却关联失败的那一段）。混在一起会让配置那几个接口看起来也很危险。
 *
 * 拼进 `jiraRouter` 的方式见 `jira.ts`；单独导出成一个对象而不是散装 procedure，
 * 是为了保持 `client.jira.*` 的调用路径不变。
 */
export const jiraDefectProcedures = {
	/** 解除缺陷关联（点错了、关联到了错的 issue）。不去动 Jira 侧的 issue。 */
	clearDefect: protectedProcedure
		.errors({ CONFLICT: {}, NOT_FOUND: {} })
		.input(runCaseIdSchema)
		.handler(async ({ context, errors, input }): Promise<DefectLinkView> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			if (defect.submittedAt !== null) {
				throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
			}
			const view: DefectLinkView = {
				defectKey: null,
				defectStatus: null,
				defectTitle: null,
				defectUrl: null,
			};
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
		}),
	/**
	 * 一键为失败用例创建 Jira issue（正向创建）。
	 *
	 * 标题 = `[测试任务名] 用例名`，描述 = 回链 + 前置条件 + 复现步骤 + 实际结果，
	 * 全部由 `lib/jira/adf.ts` 组装成 ADF（v3 的 description 不收纯文本）。
	 */
	createDefect: protectedProcedure
		.errors({
			BAD_GATEWAY: {},
			CONFLICT: {},
			NOT_FOUND: {},
			PRECONDITION_FAILED: {},
		})
		.input(runCaseIdSchema)
		.handler(async ({ context, errors, input }): Promise<DefectLinkView> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			// 这不是权威守卫（权威守卫在 setRunCaseDefect 的事务里），只是不想在
			// 必定被拒的路径上先去 Jira 建一个没人关联的孤儿 issue——
			// 外部副作用不可回滚。理由详见 jira-repository 的 DefectContext 注释。
			if (defect.submittedAt !== null) {
				throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
			}
			if (defect.defectKey !== null) {
				throw errors.CONFLICT({
					message: `该用例已关联 ${defect.defectKey}，请先解除关联再创建新的 issue`,
				});
			}
			const resolution = await resolveJiraClient(defect.projectId);
			if (resolution.kind !== "ok") {
				throw errors.PRECONDITION_FAILED({
					message:
						resolution.kind === "unconfigured"
							? "本项目未配置 Jira，请在项目设置里配置后再试，或直接手填缺陷链接"
							: "Jira 凭据当前不可用，请在项目设置里重新填写 API Token",
				});
			}
			const { client } = resolution;
			const summary = buildDefectSummary({
				caseName: defect.caseName,
				runName: defect.runName,
			});
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
			const view: DefectLinkView = {
				defectKey: created.value.key,
				defectStatus: await readFreshStatus(client, created.value.key),
				defectTitle: summary,
				defectUrl: created.value.url,
			};
			const written = await setRunCaseDefect(input.runCaseId, view);
			if (written.kind !== "ok") {
				// issue 已经建出来了但关联不上（竞态窗口里测试任务刚被提交，或记录刚被删）。
				// 把 key 报给用户，否则那个 issue 就成了没人知道的孤儿。
				throw errors.CONFLICT({
					message:
						written.kind === "locked"
							? `该测试任务已提交并锁定，不可修改；刚创建的 ${created.value.key} 需要手工处理`
							: `用例执行记录已不存在；刚创建的 ${created.value.key} 需要手工处理`,
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
		}),

	/**
	 * 反向关联：用户粘贴已有 issue 的链接或编号，校验存在后关联并回填状态。
	 *
	 * **未配置 Jira 时不发任何外部请求**，把输入当纯文本 URL 存进 `defectUrl`
	 * （D9）。这条降级路径必须先于任何 Jira 调用判断。
	 */
	linkDefect: protectedProcedure
		.errors({
			BAD_GATEWAY: {},
			BAD_REQUEST: {},
			CONFLICT: {},
			NOT_FOUND: {},
		})
		.input(
			z.object({
				reference: defectReferenceSchema,
				runCaseId: z.uuid(),
			})
		)
		.handler(async ({ context, errors, input }): Promise<DefectLinkView> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			if (defect.submittedAt !== null) {
				throw errors.CONFLICT({ message: "该测试任务已提交并锁定，不可修改" });
			}
			const resolution = await resolveJiraClient(defect.projectId);
			let view: DefectLinkView;
			if (resolution.kind === "ok") {
				const issueKey = parseIssueKey(input.reference);
				if (issueKey === null) {
					throw errors.BAD_REQUEST({
						message:
							"认不出 issue 编号，请粘贴 issue 链接或形如 PAY-123 的编号",
					});
				}
				const issue = await resolution.client.getIssue(issueKey);
				if (!issue.ok) {
					const message = describeJiraFailure(issue.failure);
					if (issue.failure.kind === "not-found") {
						throw errors.NOT_FOUND({ message: `Jira 上没有 ${issueKey}` });
					}
					throw errors.BAD_GATEWAY({ message });
				}
				view = {
					defectKey: issue.value.key,
					defectStatus: issue.value.status,
					defectTitle: issue.value.summary,
					defectUrl: issue.value.url,
				};
			} else {
				// 降级：只存 URL 原文。`defectKey` 保持 null——它的语义是
				// 「Jira 侧的 issue」，未配置的项目没有可校验的 Jira，
				// 存进去只会让后续的状态同步以为有得可同步。
				const url = normalizeExternalUrl(input.reference);
				if (url === null) {
					throw errors.BAD_REQUEST({
						message:
							"本项目未配置 Jira，请粘贴完整的缺陷链接（以 http:// 或 https:// 开头）",
					});
				}
				view = {
					defectKey: null,
					defectStatus: null,
					defectTitle: null,
					defectUrl: url,
				};
			}
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
		}),

	/**
	 * 主动拉一次 issue 状态：webhook 的兜底（plan §5.2）。
	 *
	 * 与 webhook 同理，走的是**故意绕过 submitted 守卫**的
	 * `updateDefectStatusByIssueKey`：拉回来的是外部系统此刻的事实，
	 * 不是这个测试任务的测试结论，冻结它只会让报告显示过期信息（plan §2.5 的唯一例外）。
	 */
	refreshDefectStatus: protectedProcedure
		.errors({ BAD_GATEWAY: {}, BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(runCaseIdSchema)
		.handler(async ({ errors, input }): Promise<{ status: string | null }> => {
			const defect = await getDefectContext(input.runCaseId);
			if (defect === null) {
				throw errors.NOT_FOUND({ message: "用例执行记录不存在" });
			}
			// 未配置 Jira 的项目 defectKey 恒为 null，因此这一条天然把降级项目
			// 挡在外面，一个外部请求都不会发。
			if (defect.defectKey === null) {
				throw errors.BAD_REQUEST({ message: "该用例没有关联 Jira issue" });
			}
			const resolution = await resolveJiraClient(defect.projectId);
			if (resolution.kind !== "ok") {
				throw errors.BAD_REQUEST({ message: "本项目当前无法访问 Jira" });
			}
			const issue = await resolution.client.getIssue(defect.defectKey);
			if (!issue.ok) {
				throw errors.BAD_GATEWAY({
					message: describeJiraFailure(issue.failure),
				});
			}
			const { status } = issue.value;
			if (status !== null) {
				await updateDefectStatusByIssueKey(
					defect.projectId,
					issue.value.key,
					status
				);
			}
			return { status };
		}),
};
