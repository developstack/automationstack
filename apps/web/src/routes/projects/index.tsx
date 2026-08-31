import { createFileRoute } from "@tanstack/react-router";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectsPending } from "@/components/projects/projects-pending";
import { ProjectsShell } from "@/components/projects/projects-shell";

export const Route = createFileRoute("/projects/")({
	component: ProjectsPage,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "项目列表 · 测试用例平台" }] }),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.orpc.projects.list.queryOptions()
		),
	pendingComponent: ProjectsPending,
});

function ProjectsPage() {
	return (
		<ProjectsShell phase="ready">
			<ProjectList />
		</ProjectsShell>
	);
}
