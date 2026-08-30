/**
 * ingest（Bearer token）通道的项目级授权：**一枚 token 的权限等于它主人的权限**。
 *
 * `auth/bearer.ts` 早就把这句话写成了文件头的规则，但此前只兑现了一半——
 * 它保证 token 认出来的是一个没被停用的真实用户，却没有人再问一句
 * 「这个人进得去这个项目吗」。于是前三批把浏览器会话收紧之后，token 反而
 * 比它的主人权限更大：拿着某人的 token 可以往他并不属于的项目里灌数据，
 * 而那个人自己在界面上连这个项目都看不见。这个文件就是补上的那半句。
 *
 * ## 为什么不复用 `lib/project-scope.ts`
 *
 * 那一组是 **oRPC 中间件**：它们抛 `ORPCError`、依赖 `context.user`、把结论挂进
 * `context.projectAccess`。ingest 是裸 HTTP 端点，一样都没有——它的失败要折算成
 * 类型化 outcome 再由 `apps/server` 翻成状态码（见 `./execution-ingest` 的
 * `IngestExecutionOutcome`）。共用的是**判据**而不是中间件：两边都只认
 * `lib/project-access.ts` 的 `canEnterProject`，那里是全仓唯一的判定真相。
 *
 * ## 代价
 *
 * 每个项目作用域的 ingest 请求多一次 `getProjectRole`（`(project_id, user_id)`
 * 唯一索引上的等值查找）。刻意不缓存，理由与 `lib/project-scope.ts` 逐字相同：
 * 授权结论一旦被缓存，「刚被移出项目的 CI 还能再写几秒」既难复现也没人会想到
 * 去看缓存。
 */

import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import { getProjectIdByRunId } from "@automationstack/db/repositories/project-scope-repository";
import type { User } from "@automationstack/db/schema/users";

import { canEnterProject } from "../project-access";

/**
 * 这枚 token 的主人进不进得去这个项目。
 *
 * 平台 admin 一律放行（`canEnterProject` 的第一条），因为「token 的权限等于
 * 主人的权限」是双向的：主人在界面上能进的项目，他的脚本也能进；
 * 主人进不去的，脚本也进不去。
 */
export async function tokenCanEnterProject(
	user: User,
	projectId: string
): Promise<boolean> {
	return canEnterProject({
		platformRole: user.role,
		projectRole: await getProjectRole(projectId, user.id),
	});
}

/** 项目 id → 这个人进不进得去。同一个项目只查一次角色。 */
async function accessByProjectId(
	user: User,
	projectIds: readonly string[]
): Promise<Map<string, boolean>> {
	const distinct = [...new Set(projectIds)];
	const entries = await Promise.all(
		distinct.map(
			async (projectId) =>
				[projectId, await tokenCanEnterProject(user, projectId)] as const
		)
	);
	return new Map(entries);
}

/**
 * 一批 runId 里，哪些落在这枚 token 的主人进不去的项目上。
 *
 * 给附件登记用：`POST /ingest/attachments/register` 的请求体里**没有
 * projectId**（定位靠 presign 回传的 runId + runCaseId），所以作用域只能从
 * 任务反查（`getProjectIdByRunId`，与 `lib/project-scope.ts` 的
 * `requireRunMember` 走同一条查询）。
 *
 * **查不到归属的 runId 不进这个集合**，是有意的：那说明任务压根不存在，
 * 而「不存在」下游已经有一句更准的话（`describeRunUnwritable` 的
 * `not-found` 分支）。在这里一并拒掉，只会把「任务已被删除」说成
 * 「你不是成员」——一句自信的假话，人会拿着它去要一个根本不缺的权限。
 * 放行也不会漏权限：任务不存在就没有任何行可写。
 *
 * N 现实里是 1～3（一次上报涉及的未提交任务数），所以并发查完即可，
 * 不为这个规模去 repository 加一条批量查询。
 */
export async function forbiddenRunIds(
	user: User,
	runIds: readonly string[]
): Promise<Set<string>> {
	const distinct = [...new Set(runIds)];
	const projectIds = await Promise.all(distinct.map(getProjectIdByRunId));
	const allowed = await accessByProjectId(
		user,
		projectIds.filter((projectId) => projectId !== null)
	);
	const forbidden = new Set<string>();
	for (const [index, runId] of distinct.entries()) {
		// 下标取值在 noUncheckedIndexedAccess 下是 `string | null | undefined`：
		// null 表示任务不存在（见上），undefined 不可能发生（两个数组同长）。
		// 两者一视同仁地跳过——判据缺失时**不往禁止集里加**，宁可让下游那句
		// 更准的话去说，也不凭空断言一个人没有权限。
		const projectId = projectIds[index];
		if (projectId && allowed.get(projectId) === false) {
			forbidden.add(runId);
		}
	}
	return forbidden;
}
