import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { canEnterProject, type ProjectAccess } from "./lib/project-access";

export const o = os.$context<Context>();

/** 不需要登录：只有 healthCheck 与 auth.login / auth.me 用它。 */
export const publicProcedure = o;

/**
 * 登录闸门。context.ts 已经把「停用账号」折算成 user === null，
 * 所以这里只要判空——过了这道中间件，下游的 `context.user` / `context.actor`
 * 在类型上就都是非空的，路由里不用再写 `?.` 或兜底名字。
 */
const requireUser = o.middleware(({ context, next }) => {
	if (context.user === null || context.actor === null) {
		throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
	}
	return next({ context: { actor: context.actor, user: context.user } });
});

/** 平台管理员专属（成员管理）。项目级授权见下面的 requireProjectMember。 */
const requireAdmin = o.middleware(({ context, next }) => {
	if (context.user?.role !== "admin") {
		throw new ORPCError("FORBIDDEN", { message: "需要管理员权限" });
	}
	return next();
});

/**
 * 项目级闸门：必须是本项目成员（平台 admin 放行）。规则本体在
 * `lib/project-access.ts`，这里只负责查一次角色并把结论挂进 context。
 *
 * **必须挂在 `.input()` 之后**：它要读 `input.projectId`，而 oRPC 只有在
 * 输入 schema 已经定下来之后才把校验过的输入喂给中间件。输入字段不叫
 * `projectId` 的过程（如 `projects.get` 的 `id`）用 `.use(mw, mapInput)` 改名。
 *
 * 挂上之后 `context.projectAccess` 就是下游判 owner 的唯一依据——handler 里
 * 不要再查一次库，那既多一次往返，也让「按什么判的」变成两个答案。
 */
export const requireProjectMember = o.middleware(
	async ({ context, next }, input: { projectId: string }) => {
		if (context.user === null) {
			throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
		}
		const projectAccess: ProjectAccess = {
			platformRole: context.user.role,
			projectRole: await getProjectRole(input.projectId, context.user.id),
		};
		if (!canEnterProject(projectAccess)) {
			// 刻意用 FORBIDDEN 而不是 NOT_FOUND：与 requireAdmin 同一种表达，
			// 「不够格」和「不存在」在界面上要给的出路完全不同（前者是找 owner
			// 要权限，后者是回列表页）。代价是它确认了这个 id 对应一个真项目——
			// 项目 id 是 uuid，只经成员之手流出，这点信息量换来的是可用的报错。
			throw new ORPCError("FORBIDDEN", { message: "你不是该项目的成员" });
		}
		return next({ context: { projectAccess } });
	}
);

export const protectedProcedure = o.use(requireUser);
export const adminProcedure = protectedProcedure.use(requireAdmin);
