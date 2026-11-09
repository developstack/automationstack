import { isProjectMember } from "@automationstack/db/repositories/project-members-repository";
import { getProjectIdByRunId } from "@automationstack/db/repositories/project-scope-repository";
import type { User } from "@automationstack/db/schema/users";

import { canEnterProject } from "../project-access";

export async function tokenCanEnterProject(
	user: User,
	projectId: string
): Promise<boolean> {
	return canEnterProject({
		isMember: await isProjectMember(projectId, user.id),
		platformRole: user.role,
	});
}

async function accessByProjectId(
	user: User,
	projectIds: readonly string[]
): Promise<Map<string, boolean>> {
	const distinct = [...new Set(projectIds)];
	const entries = await Promise.all(
		distinct.map(
			async (projectId) =>
				[projectId, await tokenCanEnterProject(user, projectId)] as const
		)
	);
	return new Map(entries);
}

export async function forbiddenRunIds(
	user: User,
	runIds: readonly string[]
): Promise<Set<string>> {
	const distinct = [...new Set(runIds)];
	const projectIds = await Promise.all(distinct.map(getProjectIdByRunId));
	const allowed = await accessByProjectId(
		user,
		projectIds.filter((projectId) => projectId !== null)
	);
	const forbidden = new Set<string>();
	for (const [index, runId] of distinct.entries()) {
		const projectId = projectIds[index];
		if (projectId && allowed.get(projectId) === false) {
			forbidden.add(runId);
		}
	}
	return forbidden;
}
