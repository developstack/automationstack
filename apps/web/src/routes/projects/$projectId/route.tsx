import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

import {
	ProjectShell,
	ProjectShellHeader,
} from "@/components/layout/project-shell";
import { ProjectShellSkeleton } from "@/components/layout/project-shell-skeleton";
import { PresenceAvatars } from "@/realtime/presence-avatars";
import { RealtimeProvider } from "@/realtime/realtime-provider";
import type { RouterAppContext } from "@/routes/__root";
import { orpc } from "@/utils/orpc";

interface WorkspaceLoaderData {
	projectName: string;
}

/**
 * 与同目录的 index.tsx 同理：写在路由选项字面量外面，
 * TypeScript 才能在检查同一字面量里的 `head` 之前推导出 loader 的返回类型。
 */
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
	// head 只需要项目名，整个 project 走 SSR 序列化没必要
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId")({
	component: WorkspaceLayout,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "项目"} · 测试用例平台` }],
	}),
	loader: workspaceLoader,
	/*
	 * loader 要等 projects.get + modules.tree 两条查询，超过 router.tsx 的 200ms 阈值
	 * 就得摆加载态。不摆就落到兜底的整页 spinner 上，外壳整块消失、且至少停 300ms
	 * （defaultPendingMinMs），从项目列表点进来看着像应用闪没了一次。
	 * 外壳不依赖这两条查询，所以这里换成「外壳留在原位、只有数据处是骨架」的那一份。
	 */
	pendingComponent: ProjectShellSkeleton,
});

/** 光标/presence 的页面标识：同一 page 的光标才互相渲染。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

const MINDMAP_PATH_SUFFIX = "/mindmap";
const OVERVIEW_PATH_SUFFIX = "/overview";
/**
 * 测试任务那一支：列表 /test-runs、详情 /test-runs/<id>、报告 /test-runs/<id>/report
 * 都算同一处。用 includes 而不是 endsWith，否则详情与报告会被归进「列表」。
 * 三者不再细分——presence 只回答「他在哪一块」，分到子页对读的人没有用处。
 */
const TEST_RUNS_PATH_SEGMENT = "/test-runs";
/**
 * 设置页：五格 tab 全落在 search 的 `tab` 上，pathname 自始至终是这一条，所以
 * 这里只报到「设置」为止。分到格上也没用——AI 配置、API Token、平台账号那三格
 * 改的根本不是当前项目的东西，广播「他在 API Token」对同项目的人是句废话。
 */
const SETTINGS_PATH_SUFFIX = "/settings";

/**
 * 当前路径对应哪个视图。这个值会随 presence 广播出去，别人顶栏头像的 tooltip
 * 念的「他在哪」就是它，所以每加一个项目下的子路由都要在这里补一档——漏掉的
 * 那个页面会被归进「列表」，报出去的位置是错的。
 */
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
	return "list";
}

function WorkspaceHeader({ projectName }: { projectName: string }) {
	return (
		/*
		 * 顶栏的外观（sticky、高度、下边框）与两颗面板开关都由 ProjectShellHeader
		 * 统一给出，这里只补本页专属的内容。主题切换已并入侧栏的用户菜单。
		 *
		 * 不再放「列表｜脑图」tabs：视图切换已由二级面板里的脑图入口承担（「模块」
		 * 标题行上的全项目脑图 + 每个模块行尾的那一枚），同一去处留两套导航，
		 * 用户每次都得先判断该点哪个；而且两处的选中态要各自维护，迟早对不上。
		 */
		<ProjectShellHeader>
			<div className="flex min-w-0 items-center gap-2 text-sm">
				{/*
				 * 面包屑保留，不因为二级面板的标题行也显示项目名而删：那块面板是可以
				 * 收起的，收起之后项目名就只剩这一处。
				 * h1 留在 nav 之外：页面主标题属于页面本身，不属于导航地标。
				 */}
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
			{/* ml-auto 把头像推到右端 */}
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
		/*
		 * RealtimeProvider 留在最外层：顶栏里的 PresenceAvatars 与内容区的
		 * 用例协作者标记分处外壳的两端，只有包住整个外壳才同时覆盖到。
		 */
		<RealtimeProvider projectId={projectId} view={view}>
			<ProjectShell projectId={projectId} projectName={projectName}>
				{/*
				 * 2 行：header / 内容区；高度由 ProjectShell 的栅格行逐级传下来。
				 * 分隔线不再单占一行——顶栏自带 border-b，两者并存会画出双线。
				 * 模块树已搬进二级面板，这里不再分列，只剩单一内容区。
				 */}
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
