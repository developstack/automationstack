import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";

const PROJECT_SEPARATOR = "\u00a0\u00b7 ";

export function UserProjectsCell({
	projects,
}: {
	projects: readonly UserProjectMembership[];
}) {
	if (projects.length === 0) {
		return (
			<>
				<span aria-hidden="true" className="text-muted-foreground">
					—
				</span>
				<span className="sr-only">不属于任何项目</span>
			</>
		);
	}

	return (
		<div className="wrap-break-word max-w-xs text-pretty">
			{projects.map((project) => project.name).join(PROJECT_SEPARATOR)}
		</div>
	);
}
