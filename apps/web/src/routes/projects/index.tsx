import { createFileRoute } from "@tanstack/react-router";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectsPending } from "@/components/projects/projects-pending";
import { ProjectsShell } from "@/components/projects/projects-shell";

export const Route = createFileRoute("/projects/")({
	component: ProjectsPage,
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
