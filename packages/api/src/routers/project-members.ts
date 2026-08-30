/**
 * 项目成员管理。授权规则的本体在 `lib/project-access.ts`，这里只做编排。
 *
 * 五个 handler 全部先过 `requireProjectMember`（进得来才谈得上看名单），
 * 其中三个写操作外加 `listCandidates` 再额外要求 `canAdministerProject`——也就是
 * 项目 owner 或平台 admin。**不用 `adminProcedure`**：那会让每加一个人都得去找
 * 平台管理员，而 owner 这一档存在的全部理由就是让「谁能加人」有个项目内的答案。
 *
 * 不发 `publishInvalidate`：实时协议的 `InvalidateEntity` 里没有成员这一类
 * （`realtime/protocol.ts`），加一类要连着前端的失效映射一起改，属于下一批
 * 的成员管理页。成员变更后对方需要刷新一次页面才生效，本批接受这个代价。
 *
 * `remove` 是唯一的例外，它额外发一条 `publishMembershipRevoked`——那不是
 * 「数据过期了」，是「这个人的实时连接不该再存在了」，理由见该 handler。
 */

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

/**
 * 这次改动会不会把项目的最后一个 owner 拿掉。
 *
 * 真发生了，项目就再没人能加人、改名、删除，只有平台 admin 能救——与
 * `routers/users.ts` 拦「最后一个管理员」是同一条思路，作用域从平台缩到项目。
 *
 * 两次查询之间有竞态（两个 owner 同时退出），与那边一样接受：代价是项目
 * 暂时无主，而不是数据损坏，平台 admin 一条 `add` 就能修回来。
 */
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
			// 先确认账号存在：直接插会撞外键，那是一条裸的数据库异常，
			// 到不了前端就变成 500，用户看不出是「用户名填错了」。
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
	/** 项目内**所有**成员都能看名单：连队友是谁都不知道，协作无从谈起。 */
	list: protectedProcedure
		.errors(routerErrors)
		.input(projectScopeSchema)
		.use(requireProjectMember)
		.handler(({ input }) => listProjectMembers(input.projectId)),
	/**
	 * 「添加成员」下拉框里的候选人：平台上还没进这个项目的账号。
	 *
	 * 这一条与三个写操作同一档权限，而不是跟 `list` 一样对所有成员开放：它回答的
	 * 是「平台上还有谁」，普通成员没有任何用得上它的地方，开放出去等于让每个项目
	 * 成员都能枚举平台账号。字段窄到只有 id 与用户名，理由与查询本身写在
	 * `listProjectMemberCandidates` 的注释里。
	 */
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
			if (await wouldRemoveLastOwner(input.projectId, input.userId)) {
				throw errors.BAD_REQUEST({
					message: "不能移除项目的最后一个 owner",
				});
			}
			if (!(await removeProjectMember(input.projectId, input.userId))) {
				throw errors.NOT_FOUND({ message: "该用户不是项目成员" });
			}
			// 删除**成功之后**才发：发在前面的话，一次失败的移除会白白踢掉
			// 对方的连接。WS 那边据此断开该用户在该项目的所有连接——否则他
			// 早就开着的那条 socket 会继续吐这个项目的事件流，权限收走了、
			// 数据还在流。踢掉后客户端会自动重连，重连要重新过握手校验，
			// 于是「平台 admin 被移出成员表」这种仍然有权进入的情况会自己
			// 恢复，不需要在这里分情况。
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
			// 降级不发成员撤销事件：`canEnterProject` 只看 projectRole 是不是
			// null，owner→member 依然是成员，进得来的东西一样都没变，踢连接
			// 纯属打扰。只有 `remove` 会真正拿掉进入权。
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
