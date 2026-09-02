/**
 * 浏览器会话的项目内视图（phase4 §7）：列表、详情、强杀。
 *
 * 三条都是**项目级**的，`requireProjectMember` 全程挂在 `.input()` 之后
 * （中间件要读校验过的 `input.projectId`，这是 oRPC 的硬性顺序，见 `../index.ts`）。
 *
 * ⚠️ 这里读到的 `status` 是**审计视图，不是 farm 的真相**（D6）：真相在 farm 进程的
 * 内存注册表里，库里的 `running` 只意味着「最后一次写入时它在跑」。前端拿它做展示与
 * 轮询可以，拿它判断「现在还连不连得上」不行。
 */

import { listArtifactsBySession } from "@automationstack/db/repositories/farm-session-artifact-repository";
import {
	findSessionById,
	listSessionsByProject,
	requestKill,
} from "@automationstack/db/repositories/farm-session-repository";
import type { FarmSessionArtifact } from "@automationstack/db/schema/farm-session-artifacts";
import type { FarmSession } from "@automationstack/db/schema/farm-sessions";
import { farmEnv } from "@automationstack/env/farm";
import { protectedProcedure, requireProjectMember } from "../index";
import {
	type FarmArtifactDownloadContext,
	resolveFarmArtifactDownloadUrl,
} from "../lib/farm-artifact-download";
import { getR2Storage } from "../lib/r2";
import {
	farmSessionScopeSchema,
	listFarmSessionsSchema,
} from "../schemas/farm";

const sessionErrors = {
	NOT_FOUND: {},
} as const;

/**
 * 详情页拿到的会话行：**除了 `containerId` 之外的全部字段**。
 *
 * 用 `Omit` + rest 解构而不是逐字段挑，是因为这一层的语义确实是「透传」：
 * 会话表上每一列都是排查材料，加一列就该在详情页看得见，逐字段挑会让新列默默不显示。
 * 代价是将来再加基础设施细节列时，得记得在这里也剥掉——所以剥除的理由写在下面那行，
 * 不是「隐藏实现」的洁癖，而是那一列对前端**没有任何用途**：它是宿主 daemon 上的
 * 容器 id，只有能 ssh 上那台机器的人用得上，而那些人从库里查更直接。
 */
export type FarmSessionDetail = Omit<FarmSession, "containerId">;

/**
 * 产物行**原样摊平** + 一条现签 / 拼好的下载地址；拿不到就是 null（成因见 lib）。
 *
 * 与 `test-run-attachments.list` 的 `{ attachment, url }` 不同，这里是摊平的：
 * 那边的 URL 是「现签出来的一次性凭证」，与附件行本身是两种东西，包一层能提醒
 * 调用方别把它存下来；这边 `downloadUrl` 对 local 产物就是一条稳定地址，
 * 详情页拿一行产物要同时读 `kind`、`sizeBytes` 和它，拆两层只会让每个读取点
 * 多写一次 `.artifact.`。
 */
export interface FarmSessionArtifactView extends FarmSessionArtifact {
	downloadUrl: string | null;
}

/**
 * 组一次下载上下文：R2 句柄取一次给整页产物复用。
 *
 * `presignDownload` 是**纯本地的 SigV4 计算**（HMAC + 字符串拼接，不发请求），
 * 所以一页十几条产物逐条签的成本可以忽略，与 `case-attachments.ts` 那边同一个判断。
 */
function buildDownloadContext(sessionId: string): FarmArtifactDownloadContext {
	const storage = getR2Storage();
	return {
		/**
		 * 走 farm 那份 env 而不是 server 的：`FARM_PUBLIC_URL` 描述的是 farm 进程
		 * 对外的地址，两个进程各有各的 .env（见 `packages/env/src/farm.ts` 的说明）。
		 * api 跑在 server 进程里，所以部署时 server 的环境**也要给上这一项**，
		 * 否则本地产物的下载链接会一路回落到 `http://localhost:3002`。
		 */
		farmPublicUrl: farmEnv.FARM_PUBLIC_URL,
		presignR2Download: storage === null ? null : storage.presignDownload,
		sessionId,
	};
}

export const farmSessionProcedures = {
	/**
	 * 一条会话的全部细节 + 产物清单。
	 *
	 * **必须比对 `session.projectId === input.projectId`**：授权中间件判的是
	 * 「你是不是 `input.projectId` 的成员」，而 `findSessionById` 按主键取行，
	 * 两者之间没有任何东西保证这条会话属于那个项目。少了这一比，任何项目的成员
	 * 都能拿别的项目的 sessionId 把整行读出来。会话 id 是 uuid 不好猜——但这是
	 * 「难猜」不是「不可读」，授权不赌概率。
	 *
	 * 归属不符与「不存在」一并回 `NOT_FOUND`，不区分：区分了就等于告诉调用者
	 * 「这个 id 是真的，只是不归你」，那本身就是一次信息泄露（与仓储层
	 * `requestKill` 的同一条口径）。
	 */
	get: protectedProcedure
		.errors(sessionErrors)
		.input(farmSessionScopeSchema)
		.use(requireProjectMember)
		.handler(async ({ errors, input }) => {
			const row = await findSessionById(input.sessionId);
			if (row === null || row.projectId !== input.projectId) {
				throw errors.NOT_FOUND({ message: "会话不存在" });
			}
			// 基础设施细节不进前端，理由见 `FarmSessionDetail`。
			const { containerId: _containerId, ...session } = row;
			const rows = await listArtifactsBySession(session.id);
			const context = buildDownloadContext(session.id);
			const artifacts: FarmSessionArtifactView[] = await Promise.all(
				rows.map(async (artifact) => ({
					...artifact,
					downloadUrl: await resolveFarmArtifactDownloadUrl(artifact, context),
				}))
			);
			return { artifacts, session };
		}),

	/**
	 * 控制面强杀：置**意向标记**并立刻返回，真正的销毁由 farm 的 reaper 下一拍
	 * （15s 轮询）执行。控制面与 farm 是两个进程、不互相 HTTP 调用（§7）。
	 *
	 * 所以 `requested: true` 的语义是「**已下令**」，不是「已杀死」——前端不能拿它
	 * 直接把行标成 `killed`，得继续轮询 `status`。`false` 则是「没有可杀的会话」：
	 * 会话不存在、不属于本项目、或者它已经落终态了，三者仓储层刻意不区分。
	 *
	 * 重复下令是幂等的（第一次的时刻保留下来，「从下令到杀掉花了多久」才可查），
	 * 所以按钮不必在点过之后禁用。
	 */
	kill: protectedProcedure
		.input(farmSessionScopeSchema)
		.use(requireProjectMember)
		.handler(async ({ input }) => ({
			requested: await requestKill(input.projectId, input.sessionId),
		})),

	/**
	 * 项目内的会话列表，创建时间倒序 + 分页 + 状态多选。
	 *
	 * 直接透传仓储层的 `FarmSessionListItem`（不含 capabilities / image /
	 * containerId），不在这里重新组装：多一层映射就多一处「加了列却忘了带出去」。
	 */
	list: protectedProcedure
		.input(listFarmSessionsSchema)
		.use(requireProjectMember)
		.handler(({ input }) =>
			listSessionsByProject({
				limit: input.limit,
				offset: input.offset,
				projectId: input.projectId,
				statuses: input.statuses,
			})
		),
};
