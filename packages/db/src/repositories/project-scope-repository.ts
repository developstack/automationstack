/**
 * 「这条子资源属于哪个项目」——项目级授权的**寻址**那一半。
 *
 * `project-members-repository` 的 `getProjectRole` 回答的是「这个人在这个项目里
 * 是什么角色」，可它要一个 projectId；而 `cases.get(id)`、`testRuns.submit(runId)`、
 * `testRunAttachments.remove(attachmentId)` 这类过程的入参里**根本没有 projectId**。
 * 少了这个文件，那些过程就只能各自在 handler 里先查一次业务行、再从里面掏
 * projectId——于是「授权前先解析」这件事会散落在几十个 handler 里，
 * 漏掉一个不会有任何东西变红。这里把它收成一组同形状的窄查询，
 * 由 `packages/api/src/lib/project-scope.ts` 的中间件工厂统一消费。
 *
 * 三条共同约定：
 * 1. **只 select `project_id` 一列**，理由与 `getProjectRole` 相同——调用方
 *    要的就是这一个事实，回整行会让后来者顺手拿别的字段去做别的判断，
 *    让这条本该只有「归属」语义的查询悄悄长出别的依赖。
 * 2. 查不到一律返回 `null`（仓库铁律），「不存在」还是「没权限」由 api 层翻译。
 * 3. 这些查询走的都是主键或既有索引的等值查找，且每个过程只跑一次
 *    （中间件解析一次，handler 不再重复解析）。
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { aiCaseProposals, aiGenerationSessions } from "../schema/ai";
import { modules } from "../schema/modules";
import { testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import { testRunCases, testRuns } from "../schema/test-runs";

export async function getProjectIdByCaseId(
	caseId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testCases.projectId })
		.from(testCases)
		.where(eq(testCases.id, caseId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByModuleId(
	moduleId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByRunId(
	runId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRuns)
		.where(eq(testRuns.id, runId))
		.limit(1);
	return row?.projectId ?? null;
}

/**
 * 一条执行行（`test_run_cases`）的归属。
 *
 * 从测试任务那一行取 projectId，而不是从 `test_run_cases.caseId` 指的用例取：
 * 这条执行行是**测试任务的**一部分，用例只是它引用的内容。两者在正常数据里
 * 必然同项目，但「谁能改这条结论」问的是测试任务的归属。
 */
export async function getProjectIdByRunCaseId(
	runCaseId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return row?.projectId ?? null;
}

/** 测试任务附件的归属：附件 → 执行行 → 测试任务，两跳都是主键等值。 */
export async function getProjectIdByRunAttachmentId(
	attachmentId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: testRuns.projectId })
		.from(testRunAttachments)
		.innerJoin(testRunCases, eq(testRunCases.id, testRunAttachments.runCaseId))
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunAttachments.id, attachmentId))
		.limit(1);
	return row?.projectId ?? null;
}

export async function getProjectIdByAiSessionId(
	sessionId: string
): Promise<string | null> {
	const [row] = await db
		.select({ projectId: aiGenerationSessions.projectId })
		.from(aiGenerationSessions)
		.where(eq(aiGenerationSessions.id, sessionId))
		.limit(1);
	return row?.projectId ?? null;
}

/**
 * 一批提案涉及的**去重后**项目列表。
 *
 * 返回数组而不是单个 id，是因为「这批 id 是不是全在一个项目里」本身就是调用方
 * 要判的事：`ai.rejectProposals` 只收 proposalIds，一次请求里混进别的项目的
 * 提案时，任何「取第一个」的写法都会把剩下那些一起放行。
 * 由调用方（api 的中间件）要求结果恰好一项，多一项就是跨项目调用，直接拒。
 *
 * 空数组进来时不查库：`inArray(col, [])` 在 drizzle 里会生成一条恒假条件，
 * 白跑一次往返，而答案已经知道了。
 */
export async function listProjectIdsByProposalIds(
	proposalIds: string[]
): Promise<string[]> {
	if (proposalIds.length === 0) {
		return [];
	}
	const rows = await db
		.selectDistinct({ projectId: aiGenerationSessions.projectId })
		.from(aiCaseProposals)
		.innerJoin(
			aiGenerationSessions,
			eq(aiGenerationSessions.id, aiCaseProposals.sessionId)
		)
		.where(inArray(aiCaseProposals.id, proposalIds));
	return rows.map((row) => row.projectId);
}

export interface MindmapNodeIds {
	caseIds: string[];
	moduleIds: string[];
}

/**
 * 脑图批量操作里被引用到的那些真实节点涉及的**去重后**项目列表。
 *
 * 与上面那条同样的理由，只是更要紧：一个批次里可以同时出现建模块、删用例、
 * 移动模块，`runMindmapBatch` 只用**首个**操作解析出一个 projectId 拿去发失效
 * 事件，从来没有校验过其余操作是不是同一个项目。所以授权必须看全批。
 *
 * 两张表分开查再合并，不写成一条 UNION：两条都是主键的 `IN` 查找，合并只是
 * 省一次往返，却要让读的人去想「这个 union 的两边为什么列名对得上」。
 */
export async function listProjectIdsByMindmapNodes(
	nodes: MindmapNodeIds
): Promise<string[]> {
	const [caseRows, moduleRows] = await Promise.all([
		nodes.caseIds.length === 0
			? []
			: db
					.selectDistinct({ projectId: testCases.projectId })
					.from(testCases)
					.where(inArray(testCases.id, nodes.caseIds)),
		nodes.moduleIds.length === 0
			? []
			: db
					.selectDistinct({ projectId: modules.projectId })
					.from(modules)
					.where(inArray(modules.id, nodes.moduleIds)),
	]);
	return [...new Set([...caseRows, ...moduleRows].map((row) => row.projectId))];
}
