import { getDefectContext } from "@automationstack/db/repositories/jira-repository";
import {
	setRunCaseDefect,
	updateDefectStatusByIssueKey,
} from "@automationstack/db/repositories/test-run-defects-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import type { DefectLinkView } from "../lib/jira/defect-link";
import { describeJiraFailure } from "../lib/jira/failure";
import { resolveJiraClient } from "../lib/jira/get-client";
import { publishInvalidate } from "../lib/realtime-publish";
import { defectReferenceSchema } from "../schemas/jira";
import { createDefectErrorMap, handleCreateDefect } from "./jira-defect-create";
import { handleLinkDefect, linkDefectErrorMap } from "./jira-defect-link";

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
		.errors(createDefectErrorMap)
		.input(runCaseIdSchema)
		.handler((options): Promise<DefectLinkView> => handleCreateDefect(options)),

	/**
	 * 反向关联：用户粘贴已有 issue 的链接或编号，校验存在后关联并回填状态。
	 *
	 * **未配置 Jira 时不发任何外部请求**，把输入当纯文本 URL 存进 `defectUrl`
	 * （D9）。这条降级路径必须先于任何 Jira 调用判断。
	 */
	linkDefect: protectedProcedure
		.errors(linkDefectErrorMap)
		.input(
			z.object({
				reference: defectReferenceSchema,
				runCaseId: z.uuid(),
			})
		)
		.handler((options): Promise<DefectLinkView> => handleLinkDefect(options)),

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
