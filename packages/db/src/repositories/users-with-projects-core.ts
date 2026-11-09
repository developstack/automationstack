import type { PublicUser } from "../schema/users";

export interface UserProjectMembership {
	id: string;
	name: string;
}

export interface UserWithProjects {
	projects: UserProjectMembership[];
	user: PublicUser;
}

export interface UserProjectRow {
	projectId: string | null;
	projectName: string | null;
	user: PublicUser;
}

function toMembership(row: UserProjectRow): UserProjectMembership | null {
	if (row.projectId === null || row.projectName === null) {
		return null;
	}
	return { id: row.projectId, name: row.projectName };
}

export function groupUsersWithProjects(
	rows: UserProjectRow[]
): UserWithProjects[] {
	const grouped = new Map<string, UserWithProjects>();
	for (const row of rows) {
		let entry = grouped.get(row.user.id);
		if (entry === undefined) {
			entry = { projects: [], user: row.user };
			grouped.set(row.user.id, entry);
		}
		const membership = toMembership(row);
		if (membership !== null) {
			entry.projects.push(membership);
		}
	}
	return [...grouped.values()];
}
