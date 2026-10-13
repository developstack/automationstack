import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ProjectMembersTableSkeleton } from "@/components/project-members/project-members-table-skeleton";
import {
	PROJECT_MEMBERS_MAIN,
	ProjectMembersView,
} from "@/components/project-members/project-members-view";
import type { RouterAppContext } from "@/routes/__root";

interface ProjectUsersLoaderData {
	projectName: string;
}

const projectUsersLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string };
}): Promise<ProjectUsersLoaderData> => {
	const { orpc, queryClient } = context;
	const [project] = await Promise.all([
		queryClient.ensureQueryData(
			orpc.projects.get.queryOptions({ input: { id: params.projectId } })
		),
		queryClient.ensureQueryData(
			orpc.projectMembers.list.queryOptions({
				input: { projectId: params.projectId },
			})
		),
		queryClient.ensureQueryData(orpc.auth.me.queryOptions()),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/users")({
	component: ProjectUsersPage,
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.projectName ?? "项目"} · 成员 · 测试用例平台` },
		],
	}),
	loader: projectUsersLoader,
	pendingComponent: ProjectUsersPending,
});

function ProjectUsersPending() {
	return (
		<PageTransition className={PROJECT_MEMBERS_MAIN} phase="pending">
			<PageHeader title={WORKSPACE_VIEW_LABELS.users} />
			<ProjectMembersTableSkeleton />
		</PageTransition>
	);
}

function ProjectUsersPage() {
	const { projectId } = Route.useParams();
	return <ProjectMembersView projectId={projectId} />;
}
