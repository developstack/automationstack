import {
	canAdministerProject,
	canBecomeProjectOwner,
	isProjectOwnerSuspended,
	type ProjectAccess,
} from "@automationstack/api/lib/project-access";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";

import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
	member: "成员",
	owner: "拥有者",
};

/** 说明普通用户为什么只能设为成员：显示在表单或对话框中，不写在选项旁边。服务端也检查。 */
export const OWNER_NOT_ELIGIBLE_HINT =
	"只有平台管理员和项目管理员可以成为项目拥有者，普通用户只能设为成员。";

/** 降级为普通用户的项目拥有者看到的说明。 */
export const SUSPENDED_OWNER_HINT =
	"你的平台角色是普通用户，项目拥有者的管理权限已暂停。恢复为项目管理员后，权限自动恢复。";

interface ProjectRoleOption {
	label: string;
	value: ProjectRole;
}

const MEMBER_OPTION: ProjectRoleOption = {
	label: PROJECT_ROLE_LABEL.member,
	value: "member",
};

const OWNER_OPTION: ProjectRoleOption = {
	label: PROJECT_ROLE_LABEL.owner,
	value: "owner",
};

/** 与服务端相同：账号的平台角色能成为项目拥有者。还没选账号时不能选。 */
function canPickOwner(platformRole: UserRole | undefined): boolean {
	return platformRole !== undefined && canBecomeProjectOwner(platformRole);
}

/**
 * 只列出能选的项目角色：账号不能成为项目拥有者时没有「拥有者」。
 * 当前角色已经是拥有者时（管理权限已暂停的拥有者）保留这一项，选择框才能显示当前值。
 */
export function projectRoleOptionsFor(
	platformRole: UserRole | undefined,
	currentRole?: ProjectRole
): readonly ProjectRoleOption[] {
	return canPickOwner(platformRole) || currentRole === "owner"
		? [MEMBER_OPTION, OWNER_OPTION]
		: [MEMBER_OPTION];
}

/** 选了账号，而这个账号不能成为项目拥有者：表单说明为什么没有「拥有者」。 */
export function isOwnerIneligible(platformRole: UserRole | undefined): boolean {
	return platformRole !== undefined && !canBecomeProjectOwner(platformRole);
}

/** 账号不能成为项目拥有者时（例如选了「拥有者」后换成普通用户），实际提交「成员」。 */
export function allowedProjectRole(
	role: ProjectRole,
	platformRole: UserRole | undefined
): ProjectRole {
	return canPickOwner(platformRole) ? role : "member";
}

export interface ProjectRoleHolder {
	role: ProjectRole;
	userId: string;
}

export interface SessionIdentity {
	id: string;
	role: UserRole;
}

function ownProjectRole(
	session: SessionIdentity,
	members: readonly ProjectRoleHolder[]
): ProjectRole | null {
	return members.find((member) => member.userId === session.id)?.role ?? null;
}

/** 当前用户在项目中的权限输入，与服务端的 ProjectAccess 相同。 */
export function viewerProjectAccess(
	session: SessionIdentity,
	members: readonly ProjectRoleHolder[]
): ProjectAccess {
	return {
		platformRole: session.role,
		projectRole: ownProjectRole(session, members),
	};
}

/** 与服务端共用 canAdministerProject。服务端也检查。 */
export function canManageProjectMembers(
	session: SessionIdentity | null,
	members: readonly ProjectRoleHolder[]
): boolean {
	if (session === null) {
		return false;
	}
	return canAdministerProject(viewerProjectAccess(session, members));
}

/** 用户是项目拥有者，但平台角色不能成为项目拥有者：管理权限暂停。 */
export function isSuspendedOwner(
	session: SessionIdentity | null,
	members: readonly ProjectRoleHolder[]
): boolean {
	if (session === null) {
		return false;
	}
	return isProjectOwnerSuspended(
		ownProjectRole(session, members),
		session.role
	);
}

export function projectRoleLabelFor(member: {
	platformRole: UserRole;
	role: ProjectRole;
}): string {
	if (isProjectOwnerSuspended(member.role, member.platformRole)) {
		return `${PROJECT_ROLE_LABEL.owner}（管理权限已暂停）`;
	}
	return PROJECT_ROLE_LABEL[member.role];
}

/**
 * 当前用户在项目中的角色名称。平台管理员不加入项目也能进入，这时显示平台角色。
 * 其他不在成员列表里的用户没有项目角色。
 */
export function viewerProjectRoleLabel(
	session: SessionIdentity,
	members: readonly ProjectRoleHolder[]
): string | null {
	const role = ownProjectRole(session, members);
	if (role !== null) {
		return projectRoleLabelFor({ platformRole: session.role, role });
	}
	return session.role === "admin" ? PLATFORM_ROLE_LABEL.admin : null;
}

export type ProjectMemberConfirmKind = "demote" | "promote" | "remove";

interface ProjectMemberActionsInput {
	isSelf: boolean;
	member: { platformRole: UserRole; role: ProjectRole };
	/** 项目中拥有者的数量，含管理权限已暂停的拥有者（与服务端的 countProjectOwners 相同） */
	ownerCount: number;
}

/**
 * 成员行的菜单中能用的操作，规则与服务端相同：不能降级或移出项目的最后一个拥有者，
 * 普通用户不能设为拥有者，不能移出自己。空数组表示不显示菜单按钮。
 */
export function projectMemberActionsFor({
	isSelf,
	member,
	ownerCount,
}: ProjectMemberActionsInput): ProjectMemberConfirmKind[] {
	const isOwner = member.role === "owner";
	const isLastOwner = isOwner && ownerCount <= 1;
	const usable: [ProjectMemberConfirmKind, boolean][] = [
		["demote", isOwner && !isLastOwner],
		["promote", !isOwner && canBecomeProjectOwner(member.platformRole)],
		["remove", !(isSelf || isLastOwner)],
	];
	return usable.flatMap(([kind, ok]) => (ok ? [kind] : []));
}
