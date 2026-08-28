import { sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { type TestRun, testRunCases } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import {
	type AutomationVerdictItem,
	assertAutomationVerdictItems,
	buildAutomationEventRows,
	partitionAutomationTargets,
} from "./test-run-automation-verdict-core";
import { insertRunCaseEventRows } from "./test-run-case-event-writes";
import {
	dedupe,
	findMissingRunCaseIds,
	type InvalidRunCases,
	type RunCaseVerdictSnapshotRow,
	type RunCaseWriteRejection,
	type RunReviewPending,
	selectRunCaseVerdictSnapshots,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import { uniformStepResultsSql } from "./test-run-step-results-sql";

/**
 * 自动化上报结论的写路径（plan §5.4 / §5.5）：事务编排 + 那条整批 UPDATE。
 *
 * 与手工路径（`test-run-verdicts-repository.ts`）分文件，是因为两者的写法完全
 * 不同——手工两条走 drizzle 的 `.set(buildResultPatch(...))`，这里每行的
 * result / comment 各不相同，只能走 `FROM (VALUES ...)` 的原生 SQL。
 * **但四道守卫是同一套**，见 `applyAutomationVerdicts` 的注释。
 *
 * 不发 SQL 的那半边（契约校验、D23 覆盖判据、流水行折算）在
 * `test-run-automation-verdict-core.ts`。
 */

export type { AutomationVerdictItem } from "./test-run-automation-verdict-core";

export interface ApplyAutomationVerdictsInput {
	/** token 的主人；沿用 actorId 的既有语义。 */
	actorId: string | null;
	executionId: string;
	items: AutomationVerdictItem[];
	/** D23：false 时不覆盖已有人工结论。 */
	overwriteManual: boolean;
	/** 必传，理由同 `BulkSetRunCaseResultInput.runId`。 */
	runId: string;
}

export type ApplyAutomationVerdictsOutcome =
	| InvalidRunCases
	| RunCaseWriteRejection
	| RunReviewPending
	| {
			kind: "ok";
			run: TestRun;
			/** 因 overwriteManual=false 被跳过的 runCaseId。 */
			skippedRunCaseIds: string[];
			updatedRunCaseIds: string[];
	  };

type AutomationSnapshotLookup =
	| InvalidRunCases
	| { kind: "ok"; snapshotById: Map<string, RunCaseVerdictSnapshotRow> };

/**
 * 归属校验 + 旧值快照，**一条 SELECT 办完两件事，且必须在 UPDATE 之前**。
 *
 * 与手工批量同一条 SELECT、同一个位置：它既是归属校验，又是流水里 `fromResult`
 * 的唯一来源，还多带回一列 `executedVia` 供 `partitionAutomationTargets` 的
 * 覆盖判据用。绝不为「要不要覆盖」另开第二条查询。
 *
 * 查不到的 id 直接以 `invalid-run-cases` 回给调用方——不属于这个测试任务的行
 * 一个都不许往下走到 UPDATE。
 */
async function loadAutomationSnapshots(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<AutomationSnapshotLookup> {
	const snapshots = await selectRunCaseVerdictSnapshots(tx, runId, runCaseIds);
	const invalidRunCaseIds = findMissingRunCaseIds(runCaseIds, snapshots);
	if (invalidRunCaseIds.length > 0) {
		return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
	}
	return {
		kind: "ok",
		snapshotById: new Map(
			snapshots.map((snapshot) => [snapshot.id, snapshot] as const)
		),
	};
}

/**
 * 整批一条 UPDATE：每行的 result 与 comment 都不同，所以旧值走
 * `FROM (VALUES ...)` 带进来，而不是循环 N 条语句（N 次往返 + 中途失败留下
 * 改了一半的任务）。VALUES 里每列都显式转型——Postgres 对 VALUES 里的
 * 占位符推不出类型，不写就直接报错。参数一律走占位符：`comment` 是外部
 * 来的用户输入，这里做任何字符串拼接都是注入。
 *
 * 摘成独立函数只是为了让 `applyAutomationVerdicts` 的事务体读起来是一串守卫，
 * 它必须在那个事务的 `tx` 上执行——单独拿到事务外就绕开了行锁。
 *
 * `step_results` 那一列：脚本目前只报整条用例的通过/失败，所以把这个结论铺满
 * 每一步，失败信息落到最后一步（用户定的口径，将来脚本能报到步骤级时改
 * `test-run-step-results-sql.ts` 一处）。**这一列不能不写**——`result` 必须
 * 恒等于 `deriveCaseResult(step_results)`，漏写会让自动化覆盖过的行
 * 变成「用例失败、分步全是上一次人工判的通过」。
 */
async function updateAutomationVerdictRows(
	tx: DbTransaction,
	input: ApplyAutomationVerdictsInput,
	targets: AutomationVerdictItem[]
): Promise<string[]> {
	const valueRows = targets.map(
		(item) =>
			sql`(${item.runCaseId}::uuid, ${item.result}::test_run_case_result, ${item.comment}::text)`
	);
	const updatedRows = await tx.execute<{ id: string }>(sql`
		update ${testRunCases}
		set result = v.result,
			comment = v.comment,
			case_version = (select ${testCases.currentVersion} from ${testCases} where ${testCases.id} = ${testRunCases.caseId}),
			executed_at = now(),
			executed_by = ${input.actorId}::uuid,
			executed_via = 'automation',
			last_automation_execution_id = ${input.executionId}::uuid,
			step_results = ${uniformStepResultsSql({ lastStepComment: sql`v.comment`, result: sql`v.result::text` })}
		from (values ${sql.join(valueRows, sql`, `)}) as v(id, result, comment)
		where ${testRunCases.id} = v.id
		returning ${testRunCases.id}
	`);
	return updatedRows.rows.map((row) => String(row.id));
}

interface AutomationWriteTargets {
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>;
	targets: AutomationVerdictItem[];
}

/**
 * 真正落库的那一段：一条 UPDATE + 一条流水 INSERT + 状态推导，**顺序不可换**。
 *
 * 流水的 `fromResult` 来自 UPDATE 之前查好的 `snapshotById`，所以这里先写结论
 * 再记流水是安全的；两者同在调用方的事务里，写了结论没记流水这种半截状态
 * 不可能落地（见 `test-run-case-event-writes.ts`）。状态推导必须排在最后——
 * 它读的是这批结论写完之后的用例分布。
 *
 * `targets` 为空时**一条 SQL 都不发**，连状态推导也不做：一条结论都没写，
 * 用例分布就不可能变，跑一遍推导只是白拿一次行锁。此时原样交回传进来的 `run`。
 */
async function writeAutomationTargets(
	tx: DbTransaction,
	input: ApplyAutomationVerdictsInput,
	run: TestRun,
	{ snapshotById, targets }: AutomationWriteTargets
): Promise<{ run: TestRun; updatedRunCaseIds: string[] }> {
	if (targets.length === 0) {
		return { run, updatedRunCaseIds: [] };
	}
	const updatedRunCaseIds = await updateAutomationVerdictRows(
		tx,
		input,
		targets
	);
	await insertRunCaseEventRows(
		tx,
		buildAutomationEventRows(input.actorId, targets, snapshotById)
	);
	return {
		run: await applyRunStatusDerivation(tx, { actorId: input.actorId, run }),
		updatedRunCaseIds,
	};
}

/**
 * 批量写入**自动化**上报的结论（plan §5.4 / §5.5）。
 *
 * ## 为什么不是直接调 `bulkSetRunCaseResult`
 *
 * 那个函数的签名是「整批一个 `result`、且没有 `comment`」，而一次自动化上报里
 * 每条用例各有各的结论，失败的还各带一条 message 要落进 `comment`。
 * 照 §5.4 的字面调它是调不通的——除非退化成逐条循环，那正是它的注释在拦的东西。
 *
 * 但 §5.4 真正要拦的不是「调哪个函数」，而是**别绕开那四道守卫**。本函数与
 * `bulkSetRunCaseResult` 是同一条写路径的两个入口，四件事一件不少地共用：
 * `ensureRunWritable`（`submitted` 拒收，且在事务内同一把行锁下判定）、
 * 「待评审」拒收、`applyRunStatusDerivation`（`ready → in_progress → completed`
 * 自动流转）、`buildRunCaseEventRows` + 一条 INSERT 的审计流水。
 *
 * ⚠️ **ingest 层（`packages/api`）绝不允许出现任何直接写 `test_run_cases.result`
 * 的语句**（D22）。只要有人在那边图省事写一句 update，上面四条会同时失效，
 * 而且没有任何测试会红——那才是 §5.4 排在决策表里的原因。
 */
export function applyAutomationVerdicts(
	input: ApplyAutomationVerdictsInput
): Promise<ApplyAutomationVerdictsOutcome> {
	return db.transaction(async (tx) => {
		assertAutomationVerdictItems(input.items);
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const runCaseIds = dedupe(input.items.map((item) => item.runCaseId));
		const lookup = await loadAutomationSnapshots(tx, run.id, runCaseIds);
		if (lookup.kind !== "ok") {
			return lookup;
		}
		const { snapshotById } = lookup;
		const { skippedRunCaseIds, targets } = partitionAutomationTargets(
			input.items,
			snapshotById,
			input.overwriteManual
		);
		const written = await writeAutomationTargets(tx, input, run, {
			snapshotById,
			targets,
		});
		return {
			kind: "ok" as const,
			run: written.run,
			skippedRunCaseIds,
			updatedRunCaseIds: written.updatedRunCaseIds,
		};
	});
}
