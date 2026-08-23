import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

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

/** 管理员专属（成员管理）。业务数据本身不分权限，见 schema/users.ts。 */
const requireAdmin = o.middleware(({ context, next }) => {
	if (context.user?.role !== "admin") {
		throw new ORPCError("FORBIDDEN", { message: "需要管理员权限" });
	}
	return next();
});

export const protectedProcedure = o.use(requireUser);
export const adminProcedure = protectedProcedure.use(requireAdmin);
