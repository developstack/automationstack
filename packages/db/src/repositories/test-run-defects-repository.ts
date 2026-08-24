import { and, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import type { RunCaseWriteRejection } from "./test-run-case-guards";
import { ensureRunWritable } from "./test-run-status-repository";

/**
 * 结果行上的**缺陷关联字段**读写（W4 的 Jira 联动 / D9 的手填链接降级）。
 *
 * 单独成文件的理由不是行数，而是这里住着本包唯一一处**故意不过 submitted 守卫**
 * 的写路径（`updateDefectStatusByIssueKey`）。把它和守卫齐全的
 * `setRunCaseDefect` 并排放在一个小文件里，读的人一眼能看到两者的差别和理由；
 * 混在几百行任务 CRUD 中间，它看起来就只是「忘了加守卫」。
 */

/**
 * 缺陷字段补丁。**只写显式给了值的字段**：Jira 正向创建一次性回填
 * key/url/title，反向关联只回填 key/url/title，webhook 只动 status，
 * 三条路径不该互相把对方的字段冲成 null。
 */
export interface RunCaseDefectPatch {
	defectKey?: string | null;
	defectStatus?: string | null;
	defectTitle?: string | null;
	defectUrl?: string | null;
}

export type SetRunCaseDefectResult =
	| RunCaseWriteRejection
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

/**
 * 写缺陷关联字段（供 W4 的 Jira 正向创建 / 反向关联，以及未配置 Jira 时
 * 用户手填的纯文本 URL —— D9 的优雅降级落点）。
 *
 * 走 `ensureRunWritable`：这些字段是本测试任务结论的一部分，已提交后不可改。
 * 与之相对的是 `updateDefectStatusByIssueKey`，见那里的说明。
 */
export function setRunCaseDefect(
	runCaseId: string,
	patch: RunCaseDefectPatch
): Promise<SetRunCaseDefectResult> {
	return db.transaction(async (tx) => {
		const [target] = await tx
			.select({ runId: testRunCases.runId })
			.from(testRunCases)
			.where(eq(testRunCases.id, runCaseId))
			.limit(1);
		if (!target) {
			return { kind: "not-found" as const };
		}
		const writable = await ensureRunWritable(tx, target.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const [runCase] = await tx
			.update(testRunCases)
			.set(patch)
			.where(eq(testRunCases.id, runCaseId))
			.returning();
		if (!runCase) {
			throw new Error("setRunCaseDefect: update returned no row");
		}
		return { kind: "ok" as const, run: writable.run, runCase };
	});
}

export interface DefectStatusUpdate {
	id: string;
	runId: string;
}

/**
 * Jira webhook 专用：把某个 issue 的最新状态同步到该项目下所有引用了它的结果行。
 *
 * ⚠️ **这是 `submitted` 冻结的唯一例外，故意不过 `ensureRunWritable`**
 * （plan §2.5，勿当漏洞「修」掉）。
 *
 * 理由：`defectStatus` 不是本测试任务的测试结论，而是外部系统此刻的客观事实
 * （那个 issue 关没关）。三个月后打开一份已提交的报告，需要看到当时失败的 8 条
 * 里有 6 条 Jira 已经解决，才能判断「可以开重测任务了」；把它一起冻住只会让
 * 报告长期显示过期信息，把一份本可继续被使用的报告变成死数据。
 * 报告的权威性由「结论、说明、附件、人工填的缺陷链接不可改」保证，
 * 而这些字段依然全部冻结。
 *
 * 按 `projectId` 限定范围：Jira 配置是项目级的（D8），
 * A 项目的 webhook 不该改到 B 项目里恰好同名的 issue key 上。
 */
export async function updateDefectStatusByIssueKey(
	projectId: string,
	issueKey: string,
	status: string
): Promise<DefectStatusUpdate[]> {
	const rows = await db
		.update(testRunCases)
		.set({ defectStatus: status })
		.where(
			and(
				eq(testRunCases.defectKey, issueKey),
				inArray(
					testRunCases.runId,
					db
						.select({ id: testRuns.id })
						.from(testRuns)
						.where(eq(testRuns.projectId, projectId))
				)
			)
		)
		.returning({ id: testRunCases.id, runId: testRunCases.runId });
	return rows;
}
