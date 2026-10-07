import {
	addProjectMember,
	countProjectOwners,
	getProjectRole,
	listProjectMemberCandidates,
	listProjectMembers,
	removeProjectMember,
	updateProjectMemberRole,
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

const projectRoleSchema = z.enum(["owner", "member"]);

const routerErrors = {
	BAD_REQUEST: {},
	CONFLICT: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
} as const;

const OWNER_REQUIRED_MESSAGE = "只有项目 owner 能管理成员";

const SELF_REMOVE_MESSAGE = "不能把自己移出项目";

async function wouldRemoveLastOwner(
	projectId: string,
	targetUserId: string
): Promise<boolean> {
	if ((await getProjectRole(projectId, targetUserId)) !== "owner") {
		return false;
	}
	return (await countProjectOwners(projectId)) <= 1;
}

export const projectMembersRouter = {
	add: protectedProcedure
		.errors(routerErrors)
		.input(
			projectScopeSchema.extend({
				role: projectRoleSchema.optional(),
				userId: z.uuid(),
			})
		)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			if ((await getUserById(input.userId)) === null) {
				throw errors.NOT_FOUND({ message: "用户不存在" });
			}
			const member = await addProjectMember({
				projectId: input.projectId,
				role: input.role,
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
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			return listProjectMemberCandidates(input.projectId);
		}),
	remove: protectedProcedure
		.errors(routerErrors)
		.input(memberScopeSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			if (input.userId === context.user.id) {
				throw errors.BAD_REQUEST({ message: SELF_REMOVE_MESSAGE });
			}
			if (await wouldRemoveLastOwner(input.projectId, input.userId)) {
				throw errors.BAD_REQUEST({
					message: "不能移除项目的最后一个 owner",
				});
			}
			if (!(await removeProjectMember(input.projectId, input.userId))) {
				throw errors.NOT_FOUND({ message: "该用户不是项目成员" });
			}
			publishMembershipRevoked(input.projectId, input.userId);
			return { projectId: input.projectId, userId: input.userId };
		}),
	updateRole: protectedProcedure
		.errors(routerErrors)
		.input(memberScopeSchema.extend({ role: projectRoleSchema }))
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: OWNER_REQUIRED_MESSAGE });
			}
			const isDemotion = input.role !== "owner";
			if (
				isDemotion &&
				(await wouldRemoveLastOwner(input.projectId, input.userId))
			) {
				throw errors.BAD_REQUEST({
					message: "不能降级项目的最后一个 owner",
				});
			}
			const member = await updateProjectMemberRole(
				input.projectId,
				input.userId,
				input.role
			);
			if (member === null) {
				throw errors.NOT_FOUND({ message: "该用户不是项目成员" });
			}
			return member;
		}),
};
