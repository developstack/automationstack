import {
	canAdministerProject,
	canBecomeProjectOwner,
	isProjectOwnerSuspended,
} from "@automationstack/api/lib/project-access";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";

import { PLATFORM_ROLE_LABEL } from "@/components/platform-users/platform-user-meta";

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
	member: "成员",
	owner: "拥有者",
};

/** 界面上说明普通用户为什么不能成为项目拥有者。服务端也检查。 */
export const OWNER_NOT_ELIGIBLE_HINT =
	"只有平台管理员和项目管理员可以成为项目拥有者，普通用户只能设为成员。";

/** 降级为普通用户的项目拥有者看到的说明。 */
export const SUSPENDED_OWNER_HINT =
	"你的平台角色是普通用户，项目拥有者的管理权限已暂停。恢复为项目管理员后，权限自动恢复。";

interface ProjectRoleOption {
	disabled?: boolean;
	label: string;
	value: ProjectRole;
}

const PROJECT_ROLE_OPTIONS: readonly ProjectRoleOption[] = [
	{ label: PROJECT_ROLE_LABEL.member, value: "member" },
	{ label: PROJECT_ROLE_LABEL.owner, value: "owner" },
];

/** 平台角色未知时（例如还没选账号）不禁用。 */
function ownerAllowed(platformRole: UserRole | undefined): boolean {
	return platformRole === undefined || canBecomeProjectOwner(platformRole);
}

/** 普通用户的「拥有者」选项禁用。 */
export function projectRoleOptionsFor(
	platformRole: UserRole | undefined
): readonly ProjectRoleOption[] {
	if (ownerAllowed(platformRole)) {
		return PROJECT_ROLE_OPTIONS;
	}
	return PROJECT_ROLE_OPTIONS.map((option) =>
		option.value === "owner" ? { ...option, disabled: true } : option
	);
}

/** 普通用户选了「拥有者」时，实际提交「成员」。 */
export function allowedProjectRole(
	role: ProjectRole,
	platformRole: UserRole | undefined
): ProjectRole {
	return ownerAllowed(platformRole) ? role : "member";
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

/** 与服务端共用 canAdministerProject。服务端也检查。 */
export function canManageProjectMembers(
	session: SessionIdentity | null,
	members: readonly ProjectRoleHolder[]
): boolean {
	if (session === null) {
		return false;
	}
	return canAdministerProject({
		platformRole: session.role,
		projectRole: ownProjectRole(session, members),
	});
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
