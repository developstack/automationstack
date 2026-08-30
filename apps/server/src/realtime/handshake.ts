/**
 * `/ws` 升级请求的**准入**：认人、认项目、认 Origin。
 *
 * ## 为什么在这里直接查库，而不是复用 oRPC 的中间件
 *
 * WebSocket 升级根本不经过 oRPC，`requireProjectMember` 与
 * `lib/project-scope.ts` 那一组都够不着它。此前这条路只认了「是谁」
 * （`resolveUserFromCookies`），从不问「他是不是这个项目的成员」——于是任何
 * 一个登录用户只要手上有一个 projectId，就能进那个房间，持续收到该项目的
 * `data:invalidate` 事件流（用例增删改、测试任务、脑图……）和全部在线成员的
 * presence（谁在看哪条用例）。这是一条完整的旁路。
 *
 * 补法只有一条：**在这里直接调同一套判据**。查角色走
 * `getProjectRole`（repository 的具名导出，与中间件同一条查询），判定走
 * `canEnterProject`（`lib/project-access.ts`，全仓唯一的判定真相）。
 * 刻意不在 ws 这一侧另写一个 if——授权逻辑出错的方式是「多放行了一个人」，
 * 两份实现分叉时没有任何东西会变红。
 *
 * ## 握手是一次性的
 *
 * 这里只管**建立**连接那一刻。成员被移除之后，他早就连上的那条 socket 不会
 * 自己掉线，得由服务端主动踢——那一半在 `./ws.ts` 的 `startRealtime`
 * （订阅 `realtimeBus` 的成员撤销事件）与 `./rooms.ts` 的 `evictUserFromRoom`。
 * 两半缺一不可：只做这里，被移除的人保持连接就能一直看下去。
 */

import { resolveUserFromCookies } from "@automationstack/api/context";
import { canEnterProject } from "@automationstack/api/lib/project-access";
import { colorForName } from "@automationstack/api/realtime/presence-color";
import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import { env } from "@automationstack/env/server";
import type { Context as HonoContext } from "hono";

const DEFAULT_VIEW = "list";

export interface ConnectionParams {
	clientId: string;
	color: string;
	name: string;
	projectId: string;
	/**
	 * 连接背后的**账号** id。不进 `PresenceEntry`（那是要广播给同房间所有人的
	 * 线上协议，多一个字段就是多披露一份身份信息），只留在服务端的房间记录里，
	 * 供「这个人被移出项目了，踢掉他所有连接」按 userId 定位。
	 */
	userId: string;
	view: string;
}

/**
 * 握手结论。`reason` 会原样进 1008 的 close reason——两种拒绝要说不同的话：
 * 「没登录 / 参数不全」是让客户端去重新登录，「不是项目成员」是让人去找
 * owner 要权限，糊成一句话就等于让所有握手失败都长得像会话过期。
 */
export type HandshakeResult =
	| { kind: "ok"; params: ConnectionParams }
	| { kind: "rejected"; reason: string };

export const INVALID_HANDSHAKE_REASON = "invalid realtime handshake";
export const NOT_PROJECT_MEMBER_REASON = "not a project member";

/** 浏览器会带 Origin；非浏览器客户端（脚本/测试）无 Origin，放行。 */
function isAllowedOrigin(context: HonoContext): boolean {
	const origin = context.req.header("origin");
	return !origin || origin === env.CORS_ORIGIN;
}

/**
 * 握手参数：身份（name / color）一律由服务端按会话 cookie 推导，
 * **不接受客户端自报**——否则任何人都能顶着别人的名字出现在 presence 里。
 * 仍然从 query 里读的只有三样：clientId（标签页标识，自报无害）、
 * projectId（要进哪个房间）、view（初始视图，纯展示）。
 */
export async function resolveHandshake(
	context: HonoContext
): Promise<HandshakeResult> {
	const clientId = context.req.query("clientId");
	const projectId = context.req.query("projectId");
	if (!(clientId && projectId && isAllowedOrigin(context))) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const user = await resolveUserFromCookies(context.req.header("cookie"));
	if (user === null) {
		return { kind: "rejected", reason: INVALID_HANDSHAKE_REASON };
	}
	const projectRole = await getProjectRole(projectId, user.id);
	if (!canEnterProject({ platformRole: user.role, projectRole })) {
		return { kind: "rejected", reason: NOT_PROJECT_MEMBER_REASON };
	}
	return {
		kind: "ok",
		params: {
			clientId,
			color: colorForName(user.username),
			name: user.username,
			projectId,
			userId: user.id,
			view: context.req.query("view") || DEFAULT_VIEW,
		},
	};
}
