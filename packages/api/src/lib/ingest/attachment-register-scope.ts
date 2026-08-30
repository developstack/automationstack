/**
 * 登记阶段的**作用域折算**：一批附件按任务分好组之后，哪些组要因为
 * 「这枚 token 的主人不是该项目的成员」整组拒掉。
 *
 * ## 为什么 register 是逐组拒绝，而另外三条端点是整请求 403
 *
 * `GET /ingest/runs`、`POST /ingest/executions`、`POST /ingest/attachments/presign`
 * 的请求体里都有 `projectId`：作用域是**整个请求**的属性，判不过就是整请求 403。
 * 登记请求里压根没有 projectId（定位靠 presign 回传的 `runId` + `runCaseId`，
 * `attachment-routes.ts` 里那段注释已经点名这件事），作用域只能一个任务一个任务
 * 地反查——于是它天然与这条链路上既有的那些逐组失败（任务已提交、任务已删除、
 * 用例行被移出范围）同形，走 §5.8 那条「局部失败不让整批失败」。
 *
 * 被拒的条目**绝不静默丢弃**：每一条都带着自己的 `index` 与理由进对账单，
 * 与 `buildRegisterRejections` 的其余用法一致。
 *
 * 这里一行 SQL 都不发、没有任何 db import（连 `import type` 都没有），
 * 所以可单测——反查归属与查角色那一半在 `./ingest-project-access`。
 */

import type { IngestAttachmentRegisterRejection } from "./attachment-contract";
import {
	type AttachmentRegisterGroup,
	buildRegisterRejections,
} from "./attachment-register-plan";

/**
 * 措辞刻意与 `packages/api/src/index.ts` 的 `NOT_PROJECT_MEMBER_MESSAGE`
 * （「你不是该项目的成员」）同一个意思，但说的是 token 的主人：上报方是 CI，
 * 读这句话的人要能立刻想到「去把 token 的主人加进那个项目」，
 * 而不是以为平台把他的附件弄丢了。
 */
export const REASON_PROJECT_FORBIDDEN =
	"这枚 token 的主人不是该测试任务所属项目的成员，附件未受理";

export interface RegisterScopeSplit {
	/** 作用域这一关过了的组，继续走守卫事务与逐条登记。 */
	allowed: AttachmentRegisterGroup[];
	/** 整组被作用域拒掉的条目，直接进对账单。 */
	rejected: IngestAttachmentRegisterRejection[];
}

/**
 * 按 `forbiddenRunIds` 把分好的组切成「能继续」与「整组拒」两摞。
 *
 * 入参是**禁止集**而不是允许集：查不到归属的 runId 既不在禁止集里、也不该在
 * 允许集里——它要原样流下去，让守卫事务给出那句更准的「该测试任务已不存在」。
 * 写成允许集就必须在这里替它选一句话，而这里没有足够的信息去选对。
 * 集合的来源与那条取舍写在 `./ingest-project-access` 的 `forbiddenRunIds`。
 */
export function splitRegisterGroupsByAccess(
	groups: AttachmentRegisterGroup[],
	forbiddenRunIds: ReadonlySet<string>
): RegisterScopeSplit {
	const allowed: AttachmentRegisterGroup[] = [];
	const rejected: IngestAttachmentRegisterRejection[] = [];
	for (const group of groups) {
		if (forbiddenRunIds.has(group.runId)) {
			rejected.push(
				...buildRegisterRejections(group.items, REASON_PROJECT_FORBIDDEN)
			);
			continue;
		}
		allowed.push(group);
	}
	return { allowed, rejected };
}
