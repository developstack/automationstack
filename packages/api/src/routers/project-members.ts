import {
	addProjectMember,
	listProjectMemberCandidates,
	listProjectMembers,
	removeProjectMember,
} from "@automationstack/db/repositories/project-members-repository";
import { getUserById } from "@automationstack/db/repositories/users-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { canAdministerProject } from "../lib/project-access";
import { publishMembershipRevoked } from "../lib/realtime-publish";

const projectScopeSchema = z.object({ projectId: z.uuid() });

const memberScopeSchema = z.object({
	projectId: z.uuid(),
	userId: z.uuid(),
});

const routerErrors = {
	BAD_REQUEST: {},
	CONFLICT: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
} as const;

const ADMIN_REQUIRED_MESSAGE = "只有管理员能管理项目成员";

const SELF_REMOVE_MESSAGE = "不能把自己移出项目";

export const projectMembersRouter = {
	add: protectedProcedure
		.errors(routerErrors)
		.input(memberScopeSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: ADMIN_REQUIRED_MESSAGE });
			}
			const target = await getUserById(input.userId);
			if (target === null) {
				throw errors.NOT_FOUND({ message: "用户不存在" });
			}
			const member = await addProjectMember({
				projectId: input.projectId,
				userId: input.userId,
			});
			if (member === null) {
				throw errors.CONFLICT({ message: "该用户已经是项目成员" });
			}
			return member;
		}),
	list: protectedProcedure
		.errors(routerErrors)
		.input(projectScopeSchema)
		.use(requireProjectMember)
		.handler(({ input }) => listProjectMembers(input.projectId)),
	listCandidates: protectedProcedure
		.errors(routerErrors)
		.input(projectScopeSchema)
		.use(requireProjectMember)
		.handler(({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: ADMIN_REQUIRED_MESSAGE });
			}
			return listProjectMemberCandidates(input.projectId);
		}),
	remove: protectedProcedure
		.errors(routerErrors)
		.input(memberScopeSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: ADMIN_REQUIRED_MESSAGE });
			}
			if (input.userId === context.user.id) {
				throw errors.BAD_REQUEST({ message: SELF_REMOVE_MESSAGE });
			}
			if (!(await removeProjectMember(input.projectId, input.userId))) {
				throw errors.NOT_FOUND({ message: "该用户不是项目成员" });
			}
			publishMembershipRevoked(input.projectId, input.userId);
			return { projectId: input.projectId, userId: input.userId };
		}),
};
