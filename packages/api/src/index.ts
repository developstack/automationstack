import { isProjectMember } from "@automationstack/db/repositories/project-members-repository";
import { ORPCError, os } from "@orpc/server";

import {
	isBlockedByPasswordChange,
	PASSWORD_CHANGE_REQUIRED,
	PASSWORD_CHANGE_REQUIRED_MESSAGE,
	PASSWORD_CHANGE_REQUIRED_STATUS,
} from "./auth/password-change-gate";
import type { Context } from "./context";
import { canEnterProject, type ProjectAccess } from "./lib/project-access";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireUser = o.middleware(({ context, next, path }) => {
	if (context.user === null || context.actor === null) {
		throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
	}
	if (isBlockedByPasswordChange(context.user, path)) {
		throw new ORPCError(PASSWORD_CHANGE_REQUIRED, {
			message: PASSWORD_CHANGE_REQUIRED_MESSAGE,
			status: PASSWORD_CHANGE_REQUIRED_STATUS,
		});
	}
	return next({ context: { actor: context.actor, user: context.user } });
});

const requireAdmin = o.middleware(({ context, next }) => {
	if (context.user?.role !== "admin") {
		throw new ORPCError("FORBIDDEN", { message: "需要管理员权限" });
	}
	return next();
});

export const NOT_PROJECT_MEMBER_MESSAGE = "你不是该项目的成员";

export const requireProjectMember = o.middleware(
	async ({ context, next }, input: { projectId: string }) => {
		if (context.user === null) {
			throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
		}
		const projectAccess: ProjectAccess = {
			isMember: await isProjectMember(input.projectId, context.user.id),
			platformRole: context.user.role,
		};
		if (!canEnterProject(projectAccess)) {
			throw new ORPCError("FORBIDDEN", { message: NOT_PROJECT_MEMBER_MESSAGE });
		}
		return next({ context: { projectAccess } });
	}
);

export const protectedProcedure = o.use(requireUser);
export const adminProcedure = protectedProcedure.use(requireAdmin);
