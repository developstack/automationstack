import { listIngestRunSummaries } from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";

import { resolveUserFromBearer } from "../../auth/bearer";
import {
	type IngestRunsResponse,
	ingestRunsQuerySchema,
} from "./execution-contract";
import { formatIngestIssues } from "./format-issues";
import { tokenCanEnterProject } from "./ingest-project-access";

/**
 * `GET /ingest/runs` 的编排层（plan §5.1.1）。
 *
 * 与结论上报（`./execution-ingest`）分成两个文件是因为它们**没有共享状态**：
 * 这条只读、不占幂等键、不发实时事件，唯一与那边重合的是「先结算一次自动提交」
 * 这一句（D36），而那一句在两边各自的理由并不相同（见下）。HTTP 层
 * （`apps/server/src/ingest/routes.ts`）照旧从 `./execution-ingest` 一处 import
 * 这两个端点，那边 re-export。
 */

export type IngestRunsOutcome =
	| { kind: "forbidden" }
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; response: IngestRunsResponse }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

export interface HandleIngestRunsInput {
	authorizationHeader: string | null;
	/** 查询串原样（`Object.fromEntries(url.searchParams)` 之类），未经校验。 */
	query: unknown;
}

/**
 * `GET /ingest/runs`：把该项目当前所有未提交任务摆出来（§5.1.1）。
 *
 * SDK 不依赖这个端点就能上报，它只是给人看的预检，顺带给 `runIds` 白名单提供取值。
 * 这里同样先结算一次自动提交（D36）：不结算的话，一个早该锁死的任务会出现在
 * 这份清单里，而人正是照着这份清单去填白名单的——那就成了平台亲手递给他一个错答案。
 *
 * `daysSinceLastVerdict` **只披露，不裁决**：久未动的任务照样是候选、照样会被写入，
 * 因为它确实还没提交。把「久未动」变成自动排除，就是平台在替用户裁决一个
 * 只有用户知道答案的问题——可能是忘了关，也可能是真的还在补测（§6.4）。
 */
export async function handleIngestRuns(
	input: HandleIngestRunsInput
): Promise<IngestRunsOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestRunsQuerySchema.safeParse(input.query);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	const { projectId } = parsed.data;
	if (!(await projectExists(projectId))) {
		return { kind: "project-not-found" };
	}
	// §4.4：token 的权限等于其主人。这条端点是只读的，但它披露的是「这个项目里
	// 现在有哪些未提交任务、各自叫什么名字」——那正是项目成员才该看见的东西，
	// 与 `testRuns.list` 在 oRPC 那边被 `requireProjectMember` 拦住的是同一份数据。
	// 判据与那边同源，见 `./ingest-project-access`。
	if (!(await tokenCanEnterProject(user, projectId))) {
		return { kind: "forbidden" };
	}
	await settleAutoSubmitForProject(projectId);
	return {
		kind: "ok",
		response: { runs: await listIngestRunSummaries(projectId) },
	};
}
