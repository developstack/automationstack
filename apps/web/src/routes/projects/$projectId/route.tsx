import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

import { ProjectShell } from "@/components/layout/project-shell";
import { ProjectShellHeader } from "@/components/layout/project-shell-header";
import { ProjectShellSkeleton } from "@/components/layout/project-shell-skeleton";
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

const MINDMAP_PATH_SUFFIX = "/mindmap";
const OVERVIEW_PATH_SUFFIX = "/overview";
const TEST_RUNS_PATH_SEGMENT = "/test-runs";
const SETTINGS_PATH_SUFFIX = "/settings";
const USERS_PATH_SUFFIX = "/users";

function viewFor(pathname: string): string {
	if (pathname.endsWith(MINDMAP_PATH_SUFFIX)) {
		return "mindmap";
	}
	if (pathname.endsWith(OVERVIEW_PATH_SUFFIX)) {
		return "overview";
	}
	if (pathname.includes(TEST_RUNS_PATH_SEGMENT)) {
		return "testRuns";
	}
	if (pathname.endsWith(SETTINGS_PATH_SUFFIX)) {
		return "settings";
	}
	if (pathname.endsWith(USERS_PATH_SUFFIX)) {
		return "users";
	}
	return "list";
}

function WorkspaceHeader({ projectName }: { projectName: string }) {
	return (
		<ProjectShellHeader>
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<nav aria-label="面包屑" className="flex items-center gap-2">
					<Link
						className="text-muted-foreground hover:underline"
						to="/projects"
					>
						项目
					</Link>
					<span aria-hidden="true" className="text-muted-foreground">
						/
					</span>
				</nav>
				<h1 className="truncate font-medium">{projectName}</h1>
			</div>
			<div className="ml-auto flex items-center">
				<PresenceAvatars />
			</div>
		</ProjectShellHeader>
	);
}

function WorkspaceLayout() {
	const { projectId } = Route.useParams();
	const pathname = useRouterState({ select: selectPathname });
	const view = viewFor(pathname);
	const projectQuery = useSuspenseQuery(
		orpc.projects.get.queryOptions({ input: { id: projectId } })
	);
	const projectName = projectQuery.data.name;

	return (
		<RealtimeProvider projectId={projectId} view={view}>
			<ProjectShell projectId={projectId} projectName={projectName}>
				<div className="grid min-h-0 grid-rows-header-body">
					<WorkspaceHeader projectName={projectName} />
					{/* relative + 内层 absolute：滚动区高度锁死在栅格行内，不撑破外壳 */}
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
