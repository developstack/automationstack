import { ProjectListSkeleton } from "@/components/projects/project-list-skeleton";
import { ProjectsShell } from "@/components/projects/projects-shell";

export function ProjectsPending() {
	return (
		<ProjectsShell phase="pending">
			<ProjectListSkeleton />
		</ProjectsShell>
	);
}
