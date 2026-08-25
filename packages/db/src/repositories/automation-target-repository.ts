import { sql } from "drizzle-orm";

import { db } from "../index";
import type { TestRunStatus } from "../schema/test-runs";

/**
 * 自动化上报取数层的**归属解析**部分（plan §5.1.1 / §5.3）：
 * 一条 `sourceRef` 该往哪些行写、以及它一行都没写成时到底卡在哪。
 *
 * 这里全是**只读查询**：它把候选摆出来，不改任何状态。两条禁令（不写
 * `test_run_cases.result`、不做自动提交结算）的完整理由见
 * `automation-ingest-repository.ts` 的文件头，对本文件同样成立。
 */

/**
 * 一次上报要往哪些行写（§5.3）。
 *
 * ## ⚠️ 这里**没有** `runIds`，而且不要再加回来
 *
 * §5.1.1 那个「我这轮只往这几个任务报」的白名单，一旦落在下面 LEFT JOIN 的
 * ON 子句里，被排除的候选任务就在 SQL 阶段消失了：调用方拿到的
 * 「这条 sourceRef 没有任何 runCase」与「真的不在任何未提交任务里」完全无法区分，
 * 只能给出一句假话——RunA 明明是未提交的候选，只是这一轮没带它，
 * 而那句假话会把人推向「去某个任务里追加这条用例」（D24），
 * 真正该改的却是 CI 里的白名单。
 *
 * 所以收窄一律在 api 层做，两条路径各有一份可见的候选清单：
 * 结论上报是 `execution-reconcile.ts` 的 `ReconcileAutomationTargetsInput.runIds`，
 * 附件预签名是 `attachment-reconcile.ts` 的 `PlanAttachmentUploadsInput.runIds`。
 * 收窄挪走也不会放大结果集：返回的行仍然被 `submitted_at is null` 兜住。
 */
export interface ResolveAutomationTargetsInput {
	projectId: string;
	sourceRefs: string[];
}

export interface AutomationTargetRow {
	caseId: string;
	/** 没有任何候选任务收这条用例时为 null（LEFT JOIN 的右半边）。 */
	runCaseId: string | null;
	runId: string | null;
	runName: string | null;
	runStatus: TestRunStatus | null;
	sourceRef: string;
}

/** `db.execute` 的行泛型约束是 `Record<string, unknown>`，interface 拿不到隐式索引签名。 */
interface AutomationTargetQueryRow extends AutomationTargetRow {
	[column: string]: unknown;
}

/**
 * 整批解析 `sourceRef` 的归属：**这条用例在哪些未提交的任务里，就写进哪些**（§3.7）。
 *
 * ## 为什么是 LEFT JOIN 而不是设计稿 §5.3 里那条 INNER JOIN
 *
 * 调用方要把结果分进三个桶（§5.1.1 / §5.8），而 INNER JOIN 只能区分出其中两个：
 *
 * - `unmatchedCases`——项目里压根没有这个 `sourceRef` 的用例，多半是拼错或用例还没建；
 * - `outOfScope`——用例在，但没有任何未提交任务收它。前端要拿 `caseId` 做
 *   「一键追加到某个任务」（D24），没有 `caseId` 这个按钮无从谈起；
 * - 正常写入。
 *
 * INNER JOIN 会把后两种一起压成「查不到」，而 §5.8 明写这两个数组不能合并——
 * 一个是「检查 `AS_PROJECT` 指对了没有」，另一个是「把这些用例勾进这个迭代的任务」，
 * 人要做的事完全不同。LEFT JOIN 让「用例存在但右半边全 null」这一行自己说话，
 * **一条 SQL 出全部三个桶**，不用为了补出第二个桶再往库里跑一趟。
 *
 * ## 为什么 `submitted_at is null` 必须落在这里
 *
 * §5.3 特别强调：这个条件要在**选候选时**就生效，不能靠下游
 * `bulkSetRunCaseResult` 里的 `ensureRunWritable` 兜底。兜底的后果是一次上报
 * 因为某个无关的已提交任务出现在候选里而整批失败，而那个任务本就不该是候选。
 * `ensureRunWritable` 仍然要跑（它在行锁下判定，是唯一权威），但它拦下的
 * 应该只剩「选出候选之后、写入之前被人提交了」这一种真正的竞态。
 *
 * ## 被 `submitted_at is null` 挡掉的行去哪了
 *
 * 它们不在这个结果集里，于是「一条用例只待在已提交的任务里」对上报方是隐形的——
 * 上层只能给出「不在任何未提交任务的范围内」，人照着这句话去建任务勾用例，
 * 而真相是「该新建一个重测任务」。补法**不是**把这个谓词也挪走：一条用例在长期项目里
 * 可能待过几十个历史已提交任务，谓词一挪，2000 条 sourceRef 会各自乘上历史任务数。
 * 补法是 `findSubmittedRunBlockers`——只对最终零可写目标的那几条单独问一次，成本被钉死。
 *
 * ## 为什么要带回 `runName` 和 `runStatus`
 *
 * `runName`：对账单里 `writtenTo[]` 与 `skippedManual[]` 都要它（§5.1.1）。
 * 同一条 `sourceRef` 可能在 A 任务写成功、在 B 任务被人工结论挡下（D23 按行生效），
 * 不带 `runName` 的对账单看上去自相矛盾。
 *
 * `runStatus`：`pending_review` 的任务确实是候选（它的 `submitted_at` 就是 null），
 * 但下游要单独把它拒掉并注明原因进 `outOfScope`（§5.8 第三行）。带回状态是为了
 * 让调用方给得出精确理由，而不是再查一次库。
 *
 * ⚠️ 整批一条 SQL，`sourceRefs` 走 `= any(...)`。逐条解析会让一次 200 条的上报
 * 变成 200 次往返，正是 §5.3 那条「不许 N+1」拦的东西。
 */
export async function resolveAutomationTargets(
	input: ResolveAutomationTargetsInput
): Promise<AutomationTargetRow[]> {
	if (input.sourceRefs.length === 0) {
		return [];
	}
	const projectId = sql.param(input.projectId);
	const result = await db.execute<AutomationTargetQueryRow>(sql`
		select
			tc.id         as "caseId",
			tc.source_ref as "sourceRef",
			trc.id        as "runCaseId",
			tr.id         as "runId",
			tr.name       as "runName",
			tr.status     as "runStatus"
		from test_cases tc
		left join (
			test_run_cases trc
			inner join test_runs tr on tr.id = trc.run_id
		)
			on trc.case_id = tc.id
			-- 冗余但故意保留（review 结论）：正常数据下任务与它装的用例必属同一项目，
			-- 这一句永远不会多筛掉行。留着是因为这条查询的 projectId 来自外部 SDK：
			-- 它把「只能写进本项目的任务」钉进了 SQL 本身，而不是依赖
			-- 「用例属于本项目」这个需要拐一道弯才能推出的间接保证；顺带给优化器
			-- 在 test_runs 上多一个项目谓词。
			and tr.project_id = ${projectId}
			and tr.submitted_at is null
			-- 这里**刻意没有** runIds 白名单谓词：收窄在 api 层做，理由见
			-- ResolveAutomationTargetsInput 的注释；模板字符串里不能写反引号。
		where tc.project_id = ${projectId}
			and tc.source_ref = any(${sql.param(input.sourceRefs)}::text[])
		order by tc.source_ref asc, tr.created_at asc nulls first
	`);
	return result.rows;
}

export interface FindSubmittedRunBlockersInput {
	projectId: string;
	/** **只传最终零可写目标、且没有别的解释的那几条**，别整批传，见下。 */
	sourceRefs: string[];
}

export interface SubmittedRunBlocker {
	/** 挡住它的那个已提交任务的名字——理由里必须点名，否则人不知道该去看哪个任务。 */
	runName: string;
	sourceRef: string;
	submittedAt: Date;
}

/**
 * `db.execute` 的行泛型约束是 `Record<string, unknown>`，interface 拿不到隐式索引签名。
 *
 * ⚠️ `submittedAt` 在这里是 **string 而不是 Date**：drizzle 的 node-postgres 驱动
 * 把 timestamptz 的类型解析器换成了「原样字符串」，由它自己的列映射负责转 Date——
 * 而 `db.execute` 这条裸 SQL 路径没有列映射，拿到的就是驱动给的原样值。
 * 照着 `Date` 声明它不会报错，只会让下游 `toLocaleString("zh-CN")` 悄悄命中
 * `String.prototype.toLocaleString`，把 `2026-08-24 21:16:47.414-07` 原样印进
 * 给人看的拒绝理由里（实测如此）。所以查询行单独一个类型，出口处显式转。
 */
interface SubmittedRunBlockerQueryRow
	extends Omit<SubmittedRunBlocker, "submittedAt"> {
	submittedAt: string;
	[column: string]: unknown;
}

/**
 * **诊断查询**：这几条 sourceRef 一条可写目标都没有，是不是因为收它的任务已经提交了。
 *
 * ## 为什么它是单独一条查询，而不是把谓词从主查询挪走
 *
 * `resolveAutomationTargets` 的 `submitted_at is null` 必须留在 ON 子句里（§5.3）。
 * 挪走的代价是结果集规模：一条用例在一个长期项目里可能待过几十个历史已提交任务，
 * 2000 条 sourceRef 会各自乘上历史任务数，主查询直接膨胀。而**诊断只需要回答
 * 「这条为什么落空」**，只对最终零可写目标的那几条跑——正常情况下这是很少的几条，
 * 成本被精确限制住。
 *
 * ## ⚠️ 边界：本函数的结果**只用于拼装拒绝理由，绝不参与任何写入判定**
 *
 * 它读的是已提交的任务，而已提交的任务**永远不是候选**（§3.7 / §5.3）。
 * 一旦有人拿它回来的 runId/runCaseId 去写点什么，「提交即锁定」当场失效，
 * 而且不会有任何测试会红——所以这里连 runId 和 runCaseId 都不返回，
 * 只回名字和提交时间，从签名上就让那件事做不到。
 *
 * `distinct on` 取每条 sourceRef **最近提交**的那个任务：一条用例可能待过几十个
 * 历史任务，全列出来对看对账单的人没有增量信息，最近的那个才是他刚跑完的那轮。
 */
export async function findSubmittedRunBlockers(
	input: FindSubmittedRunBlockersInput
): Promise<SubmittedRunBlocker[]> {
	if (input.sourceRefs.length === 0) {
		return [];
	}
	const projectId = sql.param(input.projectId);
	const result = await db.execute<SubmittedRunBlockerQueryRow>(sql`
		select distinct on (tc.source_ref)
			tc.source_ref  as "sourceRef",
			tr.name        as "runName",
			tr.submitted_at as "submittedAt"
		from test_cases tc
		inner join test_run_cases trc on trc.case_id = tc.id
		inner join test_runs tr on tr.id = trc.run_id
		where tc.project_id = ${projectId}
			and tc.source_ref = any(${sql.param(input.sourceRefs)}::text[])
			and tr.project_id = ${projectId}
			and tr.submitted_at is not null
		order by tc.source_ref asc, tr.submitted_at desc
	`);
	return result.rows.map((row) => ({
		runName: row.runName,
		sourceRef: row.sourceRef,
		submittedAt: new Date(row.submittedAt),
	}));
}
