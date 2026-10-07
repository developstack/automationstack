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

export const PROJECT_ROLE_OPTIONS: readonly ProjectRoleOption[] = [
	{ label: PROJECT_ROLE_LABEL.member, value: "member" },
	{ label: PROJECT_ROLE_LABEL.owner, value: "owner" },
];

export interface ProjectRoleHolder {
	role: ProjectRole;
	userId: string;
}

export interface SessionIdentity {
	id: string;
	role: UserRole;
}

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

export type ProjectMemberConfirmKind = "demote" | "promote" | "remove";
