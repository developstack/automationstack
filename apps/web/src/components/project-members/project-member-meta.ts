/**
 * 成员管理页的纯逻辑：两档项目角色的中文名，以及「我能不能管这个项目的成员」。
 *
 * 单独成一个不 import React、也不 import orpc 的文件，理由与
 * `packages/api/src/lib/project-access.ts` 一样：授权判定出错的方式是「多放行
 * 了一个人」，那既不抛异常也不让类型检查变红，只有测试能抓。放在这里，
 * `project-member-meta.test.ts` 就能把规则逐条钉死，不用渲染任何组件。
 *
 * 这里的判定是服务端 `canAdministerProject` 的**镜像**，不是它的替代品：真正
 * 拦人的是 `routers/project-members.ts` 里那三处 FORBIDDEN，前端这一份只决定
 * 「操作控件画不画」。两边任何一边先改都会让界面与后端对不上，改的时候要一起动。
 */

import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
	member: "成员",
	owner: "拥有者",
};

interface ProjectRoleOption {
	label: string;
	value: ProjectRole;
}

/** member 排在前面：加人默认加成 member，第一项即默认值。 */
export const PROJECT_ROLE_OPTIONS: readonly ProjectRoleOption[] = [
	{ label: PROJECT_ROLE_LABEL.member, value: "member" },
	{ label: PROJECT_ROLE_LABEL.owner, value: "owner" },
];

/** 判定只用得上这两列，所以不收整份 `ProjectMemberView`。 */
export interface ProjectRoleHolder {
	role: ProjectRole;
	userId: string;
}

/** 当前登录者；未登录（或会话还在加载）时为 null。 */
export interface SessionIdentity {
	id: string;
	role: UserRole;
}

/**
 * 能不能增删改这个项目的成员。
 *
 * 与服务端一样的两条：平台 admin 一律放行（他本来就能改任何人的账号，再拦他
 * 只是把同一件事绕远路），否则要在本项目的名单里且角色是 owner。
 *
 * 成员名单从 `projectMembers.list` 来——那一条对项目内所有人开放，所以任何进得
 * 来的人都能算出这个结论，包括「我是普通成员」这个否定结论。不为此另开一条
 * 「我的角色是什么」的过程：同一个事实两处取，迟早有一处是旧的。
 */
export function canManageProjectMembers(
	session: SessionIdentity | null,
	members: readonly ProjectRoleHolder[]
): boolean {
	if (session === null) {
		return false;
	}
	if (session.role === "admin") {
		return true;
	}
	return members.some(
		(member) => member.userId === session.id && member.role === "owner"
	);
}

/**
 * 行内菜单里需要二次确认的三个动作。
 *
 * 改角色本身不算破坏性，但它和移除一样可能被服务端挡下（不能降级 / 移除最后
 * 一个 owner），确认框同时也是这些错误的落点——照 `components/members` 那边
 * 的做法，服务端拒绝时框不关闭，错误就写在框里。
 */
export type ProjectMemberConfirmKind = "demote" | "promote" | "remove";
