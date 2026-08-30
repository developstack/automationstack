import {
	completeAutomationExecution,
	type EnsureAutomationExecutionResult,
	ensureAutomationExecution,
	resolveAutomationTargets,
} from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";
import type { User } from "@automationstack/db/schema/users";

import { resolveUserFromBearer } from "../../auth/bearer";
import {
	type IngestExecutionReceipt,
	type IngestExecutionRequest,
	ingestExecutionRequestSchema,
} from "./execution-contract";
import { buildReceipt, cachedReceipt } from "./execution-receipt";
import {
	buildCaseIdBySourceRef,
	findDuplicateSourceRefs,
	reconcileAutomationTargets,
} from "./execution-reconcile";
import { ingestActor, writeGroups } from "./execution-verdict-writer";
import { formatIngestIssues } from "./format-issues";
import { tokenCanEnterProject } from "./ingest-project-access";

/**
 * ingest 两个端点的**编排层**（plan §5.1.1 / §5.2 / §5.5 / §5.7 / §5.8）。
 *
 * 结构照 `lib/jira/webhook-handler.ts`：外部来的、没有会话 cookie 的请求，
 * 不走 `createContext`（走一遍只会白做一次 cookie 解析加一次读库），
 * 也不走 oRPC。HTTP 层（`apps/server`）只剩「取头、取体、把类型化结果映射成状态码」。
 *
 * 本文件 import 了 db repository，**因此不可单测**（api 的 vitest project
 * 没有 `DATABASE_URL`）。所以这里刻意只剩「按顺序调用 + 传参」——
 * 所有会写错的判断（分桶、去重、截断、拒绝理由）都在 `./execution-reconcile`，
 * 那边是纯的、有单测。同样不可单测的另外三步各自成文件、都只剩取数与拼接：
 * 写事务在 `./execution-verdict-writer`，对账单在 `./execution-receipt`，
 * `GET /ingest/runs` 在 `./execution-runs-preflight`（从本文件 re-export，
 * `apps/server` 照旧一处 import 两个端点）。
 *
 * ⚠️ **D22 红线**：本文件（以及整个 `packages/api`）绝不出现任何直接写
 * `test_run_cases.result` 的语句，也不 import drizzle 或 db 实例。
 * 结论只有 `applyAutomationVerdicts` 一个入口——`submitted` 拒收、待评审拒收、
 * `ready → in_progress → completed` 自动流转、审计流水，四件事全挂在它身上。
 * 在这里图省事写一句 update，四条会同时失效，而且没有任何测试会红。
 */

/**
 * 端点的类型化结果。HTTP 映射由 `apps/server` 做：
 * `unauthorized` → 401、`forbidden` → 403、`project-not-found` → 404、
 * `invalid-payload` / `duplicate-source-refs` → 400、`ok` → 200。
 *
 * ⚠️ `ok` 里 `writtenTo` 为空**仍然是 200**（§5.8 最后一段）：HTTP 状态码表达
 * 「请求本身有没有问题」，对账单表达「业务上发生了什么」。把「没有任何任务收这批
 * 用例」做成 404，SDK 就分不清是路由错了还是业务结果——由 SDK 自己把
 * 「一条都没写进去」翻成非零退出码。
 */
export type IngestExecutionOutcome =
	| { kind: "duplicate-source-refs"; sourceRefs: string[] }
	| { kind: "forbidden" }
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; receipt: IngestExecutionReceipt }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

export interface HandleIngestExecutionInput {
	/** `Authorization: Bearer as_xxx` 原样；解析与校验在 `resolveUserFromBearer`。 */
	authorizationHeader: string | null;
	/** 已 `JSON.parse` 的请求体，未经校验。schema 在本层跑，HTTP 层不做业务校验。 */
	body: unknown;
}

/** §5.5 第 1 步：先占住幂等键（`completedAt` 留 null）。 */
function ensureExecutionRow(
	request: IngestExecutionRequest,
	user: User
): Promise<EnsureAutomationExecutionResult> {
	return ensureAutomationExecution({
		branch: request.branch,
		ciUrl: request.ciUrl,
		commitSha: request.commitSha,
		finishedAt: request.finishedAt,
		idempotencyKey: request.idempotencyKey,
		projectId: request.projectId,
		reportedBy: user.id,
		startedAt: request.startedAt,
	});
}

/**
 * §5.5 第 3 步：全部任务跑完才落 `completedAt`、`receipt` 与两个**全局**计数。
 *
 * 计数跨本轮全部被写入的任务累加，只为「我上次那轮跑了多少条」一条 SQL 出完；
 * 报告里任何按任务的数字都必须回 `test_run_cases` 现算（§3.2）。
 * 对账单原样存进去：重放要返回的是**当时说过的话**，不是按当前状态重算的结果（§5.2）。
 */
async function completeExecution(
	executionId: string,
	receipt: IngestExecutionReceipt
): Promise<void> {
	const updatedCount = receipt.writtenTo.reduce(
		(total, entry) => total + entry.updated,
		0
	);
	await completeAutomationExecution({
		id: executionId,
		receipt,
		skippedCount: receipt.skippedManual.length,
		updatedCount,
	});
}

async function ingestParsedExecution(
	request: IngestExecutionRequest,
	user: User
): Promise<IngestExecutionOutcome> {
	if (!(await projectExists(request.projectId))) {
		return { kind: "project-not-found" };
	}
	// §4.4 的边界是「token 的权限严格等于其主人」，所以这里按**主人的成员
	// 资格**判，判据与浏览器会话走的那条完全同源（`lib/project-access.ts`）。
	// 顺序是先存在后成员，与 `lib/project-scope.ts` 一致：「项目不存在」与
	// 「你不在这个项目里」在 CI 日志里要给的出路完全不同，前者去改 `AS_PROJECT`，
	// 后者去找 owner 加人。代价是 404 与 403 的差别确认了某个 uuid 是真项目——
	// 与 `index.ts` 的 `requireProjectMember` 是同一个取舍，那里有更长的说明。
	if (!(await tokenCanEnterProject(user, request.projectId))) {
		return { kind: "forbidden" };
	}
	// D36 / §3.8：**在选候选任务之前**结算一次超时自动提交。
	// plans/011 那个每日 03:00 的扫描是天级的，写入这一刻的准确性只能靠这一次——
	// 少了它，一个早该自动提交的任务会被当成候选，脚本的结论就写进了一个
	// 本该锁死的任务里，而报告事后被改数是第二期明令要杜绝的事。
	await settleAutoSubmitForProject(request.projectId);
	const ensured = await ensureExecutionRow(request, user);
	const { execution } = ensured;
	if (ensured.kind === "existing" && execution.completedAt !== null) {
		return { kind: "ok", receipt: await cachedReceipt(execution) };
	}
	// `completedAt === null` 的既有行不在这里分叉：整轮重跑就是它的处理方式（§5.2 / §5.5）。
	// 上一轮可能死在任意一个任务上，只有从头再跑一遍才知道剩下哪些没写。
	const rows = await resolveAutomationTargets({
		projectId: request.projectId,
		sourceRefs: request.results.map((result) => result.sourceRef),
	});
	// `runIds` 白名单在**这一层**收窄，不在 SQL 里（理由见
	// `ReconcileAutomationTargetsInput.runIds` 与 `ResolveAutomationTargetsInput`）。
	const reconciled = reconcileAutomationTargets({
		results: request.results,
		rows,
		runIds: request.runIds,
	});
	const written = await writeGroups({
		actor: ingestActor(user),
		caseIdBySourceRef: buildCaseIdBySourceRef(rows),
		executionId: execution.id,
		groups: reconciled.groups,
		overwriteManual: request.overwriteManual,
		projectId: request.projectId,
		userId: user.id,
	});
	const receipt = await buildReceipt({
		executionId: execution.id,
		projectId: request.projectId,
		reconciled,
		written,
	});
	await completeExecution(execution.id, receipt);
	return { kind: "ok", receipt };
}

/** `POST /ingest/executions`。步骤顺序即 §5.5，别调换。 */
export async function handleIngestExecution(
	input: HandleIngestExecutionInput
): Promise<IngestExecutionOutcome> {
	// 鉴权在校验之前：没通过鉴权的调用方不该从 400 的字段名里读出请求体长什么样。
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestExecutionRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	// 去重检查排在任何写操作之前：整批拒绝就该是「什么都没发生」，
	// 连一行 `automation_executions` 占位都不该留下——留下了，
	// 上报方改好重发时会撞上同一个幂等键的 `completedAt = null` 那条路。
	const duplicated = findDuplicateSourceRefs(parsed.data.results);
	if (duplicated.length > 0) {
		return { kind: "duplicate-source-refs", sourceRefs: duplicated };
	}
	return await ingestParsedExecution(parsed.data, user);
}

/**
 * `GET /ingest/runs` 的三个符号从前定义在本文件里，现在只是 re-export：
 * `apps/server/src/ingest/routes.ts` 照旧从这一个路径 import 两个端点。
 */
// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面，见上
export {
	type HandleIngestRunsInput,
	handleIngestRuns,
	type IngestRunsOutcome,
} from "./execution-runs-preflight";
