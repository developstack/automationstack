import { asc, countDistinct, eq, inArray } from "drizzle-orm";

import type { Module } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";
import { getModuleSubtreeIds } from "./module-subtree";
import type { DbTransaction } from "./repository-types";

/**
 * 模块删除的引用闸门：与 `removeTestCaseInTx` 同一口径，删之前先查引用，
 * 返回结构化的拒绝结果，而不是让数据库抛异常。
 *
 * 为什么模块也需要这道闸门（原来没有，是遗漏不是设计）：
 * `modules.parentId` 与 `test_cases.moduleId` 都是 `onDelete: cascade`，
 * 删一个模块会一路级联删掉**整棵子树里的每一条用例**；而
 * `test_run_cases.caseId` 是全库唯一一条 `onDelete: restrict`
 * （schema/test-runs.ts，理由见那里的注释：cascade 会让历史测试任务的统计
 * 数字自己变化）。级联撞上它时数据库只给一个 23503，既拿不到「谁挡住了」，
 * 又会把整个事务连坐掉——在脑图批量路径里那是最多 100 个操作一起回滚，
 * 用户刚做的改名 / 移动 / 新建全部丢失，还只看到一句通用失败。
 *
 * 出口和用例一样是把用例改成「废弃」状态，而不是删。
 */

/** 拒绝文案里最多点名几条用例：够用户直接去处理，又不会把提示撑爆。 */
const BLOCKED_CASE_SAMPLE_LIMIT = 3;

/** 挡路的用例，够调用方在提示里点名。 */
export interface BlockedCaseRef {
	id: string;
	name: string;
}

export interface ModuleDeleteBlocked {
	/** 挡路用例的样本，最多 `BLOCKED_CASE_SAMPLE_LIMIT` 条。 */
	blockedCases: BlockedCaseRef[];
	kind: "blocked";
	/** 被拒的模块本身：调用方据此说清楚是**哪个**模块挡住了。 */
	module: Module;
	/** 这些用例一共分布在多少个测试任务里（与删用例文案里的口径同源）。 */
	referencedByRunCount: number;
	/** 子树内被引用的用例总数，可能大于 `blockedCases.length`。 */
	referencedCaseCount: number;
}

/**
 * `removeModuleInTx` 的返回契约：三选一，任何分支都不抛异常。
 * 与 `RemoveTestCaseResult`（repository-types.ts）形态一致。
 */
export type RemoveModuleResult =
	| ModuleDeleteBlocked
	| { kind: "not-found" }
	| { kind: "removed"; module: Module };

/** 被引用的用例样本；按名字排序保证提示文案稳定（同一次拒绝两次点名一样的用例）。 */
function listBlockedCases(
	tx: DbTransaction,
	subtreeIds: string[]
): Promise<BlockedCaseRef[]> {
	return tx
		.select({ id: testCases.id, name: testCases.name })
		.from(testCases)
		.innerJoin(testRunCases, eq(testRunCases.caseId, testCases.id))
		.where(inArray(testCases.moduleId, subtreeIds))
		.groupBy(testCases.id, testCases.name)
		.orderBy(asc(testCases.name))
		.limit(BLOCKED_CASE_SAMPLE_LIMIT);
}

/**
 * 检查删 `module` 会不会撞上 `test_run_cases` 的 restrict 外键。
 * 被挡住时返回 `ModuleDeleteBlocked`，可以删时返回 null。
 *
 * **范围必须是整棵子树**，这是这道闸门最容易写错的地方：只查
 * `moduleId = module.id` 的直接下级用例，会漏掉孙模块及更深层里的用例，
 * 而那些恰恰也是级联会删到的行——漏掉就等于闸门形同虚设。子树 id 复用
 * 已有的递归 CTE（module-subtree.ts），与移动时的成环检测同一个来源。
 *
 * 查询与删除必须同事务：否则查完到删掉之间，别人可以新建一个测试任务把
 * 用例引用上，闸门就被绕过去了。
 */
export async function checkModuleDeleteBlock(
	tx: DbTransaction,
	module: Module
): Promise<ModuleDeleteBlocked | null> {
	const subtreeIds = await getModuleSubtreeIds(tx, module.id);
	if (subtreeIds.length === 0) {
		return null;
	}
	const [totals] = await tx
		.select({
			caseCount: countDistinct(testRunCases.caseId),
			runCount: countDistinct(testRunCases.runId),
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(inArray(testCases.moduleId, subtreeIds));
	const referencedCaseCount = totals?.caseCount ?? 0;
	if (referencedCaseCount === 0) {
		return null;
	}
	return {
		blockedCases: await listBlockedCases(tx, subtreeIds),
		kind: "blocked",
		module,
		referencedByRunCount: totals?.runCount ?? 0,
		referencedCaseCount,
	};
}

/**
 * 拒绝文案。措辞与删用例那条（cases router 的
 * 「该用例被 N 个测试任务引用，无法删除；可改为「废弃」状态」）对齐。
 *
 * 放在这里而不是各自的 router：单删和脑图批量两条路径都要说这件事，
 * 分开写两份，将来只会各自漂移成两种说法。
 */
export function describeModuleDeleteBlock(
	blocked: ModuleDeleteBlocked
): string {
	const names = blocked.blockedCases.map((item) => item.name).join("、");
	const truncated = blocked.referencedCaseCount > blocked.blockedCases.length;
	const sample = names === "" ? "" : `（${names}${truncated ? "等" : ""}）`;
	return `模块「${blocked.module.name}」下有 ${blocked.referencedCaseCount} 条用例被 ${blocked.referencedByRunCount} 个测试任务引用，无法删除${sample}；可先把这些用例改为「废弃」状态`;
}
