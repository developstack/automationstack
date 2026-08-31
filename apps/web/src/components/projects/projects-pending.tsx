/**
 * 项目列表页的加载态（路由的 pendingComponent），自 routes/projects/index.tsx
 * 拆出。壳与就绪态同一份，只有里面换成骨架。
 */
import { ProjectListSkeleton } from "@/components/projects/project-list-skeleton";
import { ProjectsShell } from "@/components/projects/projects-shell";

export function ProjectsPending() {
	return (
		<ProjectsShell phase="pending">
			<ProjectListSkeleton />
		</ProjectsShell>
	);
}
