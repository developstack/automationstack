import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

import {
	HEADER_PATH_LINK_CLASS,
	HeaderPath,
	type HeaderPathItem,
} from "@/components/layout/header-path";
import { ProjectShell } from "@/components/layout/project-shell";
import { ProjectShellHeader } from "@/components/layout/project-shell-header";
import { ProjectShellSkeleton } from "@/components/layout/project-shell-skeleton";
import { PROJECTS_PATH_ITEM } from "@/components/layout/projects-path-item";
import {
	isNestedTestRunPath,
	WORKSPACE_VIEW_LABELS,
	type WorkspaceView,
	workspaceViewFor,
} from "@/components/layout/workspace-path";
import { PresenceAvatars } from "@/realtime/presence-avatars";
import { RealtimeProvider } from "@/realtime/realtime-provider";
import type { RouterAppContext } from "@/routes/__root";
import { orpc } from "@/utils/orpc";

interface WorkspaceLoaderData {
	projectName: string;
}

const workspaceLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string };
}): Promise<WorkspaceLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.modules.tree.queryOptions({
				input: { projectId: params.projectId },
			})
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId")({
	component: WorkspaceLayout,
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "项目"} · 测试用例平台` }],
	}),
	loader: workspaceLoader,
	pendingComponent: ProjectShellSkeleton,
});

const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

function sectionPathItem(
	projectId: string,
	view: WorkspaceView,
	pathname: string
): HeaderPathItem {
	const label = WORKSPACE_VIEW_LABELS[view];
	if (view === "testRuns" && isNestedTestRunPath(pathname)) {
		return {
			key: "section",
			label: (
				<Link
					className={HEADER_PATH_LINK_CLASS}
					params={{ projectId }}
					to="/projects/$projectId/test-runs"
				>
					{label}
				</Link>
			),
		};
	}
	return { current: true, key: "section", label };
}

function WorkspaceHeader({
	pathname,
	projectId,
	projectName,
	view,
}: {
	pathname: string;
	projectId: string;
	projectName: string;
	view: WorkspaceView;
}) {
	const items: HeaderPathItem[] = [
		PROJECTS_PATH_ITEM,
		{ key: "project", label: projectName },
		sectionPathItem(projectId, view, pathname),
	];
	return (
		<ProjectShellHeader>
			<HeaderPath items={items} />
			<div className="ml-auto flex items-center">
				<PresenceAvatars />
			</div>
		</ProjectShellHeader>
	);
}

function WorkspaceLayout() {
	const { projectId } = Route.useParams();
	const pathname = useRouterState({ select: selectPathname });
	const view = workspaceViewFor(pathname);
	const projectQuery = useSuspenseQuery(
		orpc.projects.get.queryOptions({ input: { id: projectId } })
	);
	const projectName = projectQuery.data.name;

	return (
		<RealtimeProvider projectId={projectId} view={view}>
			<ProjectShell projectId={projectId} projectName={projectName}>
				<div className="grid min-h-0 grid-rows-header-body">
					<WorkspaceHeader
						pathname={pathname}
						projectId={projectId}
						projectName={projectName}
						view={view}
					/>
					<div className="relative min-h-0 min-w-0 overflow-hidden">
						<div className="absolute inset-0 overflow-y-auto">
							<Outlet />
						</div>
					</div>
				</div>
			</ProjectShell>
		</RealtimeProvider>
	);
}
