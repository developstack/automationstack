/**
 * 项目内的设置页：三格 tab（项目设置 / Jira 集成 / API Token）。
 *
 * 这一页收编了原来的几个顶级路由（/settings、/api-tokens 等）。它们本来挂在
 * 全局作用域的一级侧栏上，而项目侧栏的「设置」那一项指过去时会把人整个带出
 * 项目外壳、换成另一套侧栏——同一次点击既换了页又换了作用域。收进项目里之后
 * projectId 由路由参数直给，原先那套 `?projectId=` 查询参数与「记住最近项目」
 * 的 localStorage 也跟着一起去掉了。
 *
 * 三格里有一格改的不是当前项目的东西（API Token 是个人级）。位置这条线索没了，
 * 改由面板里一句可见的作用域说明补上，见
 * components/settings/settings-scope-note.tsx。
 */
import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { SettingsPendingPanel } from "@/components/settings/settings-pending-panel";
import {
	resolveSettingsTab,
	type SettingsTab,
	settingsTabSearchSchema,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { SettingsTabPanels } from "@/components/settings/settings-tab-panels";
import {
	SETTINGS_MAIN,
	SettingsTabs,
	useSettingsTab,
} from "@/components/settings/settings-tabs";
import type { RouterAppContext } from "@/routes/__root";

interface SettingsLoaderData {
	projectName: string;
}

/**
 * 只预取**当前这一格**要的东西。
 *
 * 三格全预取等于每进一次设置页就多打两条谁也没看的请求。按 tab 分支的代价是
 * loaderDeps 要把 tab 算进依赖（见下），换来的是行为与搬家前几个独立路由逐条一致。
 *
 * 项目设置与 Jira 那两格一条都不预取：两个分区各自取数、各自失败、互不阻塞
 * （理由见 components/settings/settings-section.tsx 顶部），塞进 loader 就等于把
 * 「Jira 配置取不到」变成整页取不到。这也意味着那两格的 loader 当场就回，
 * 够不着 200ms 的 pending 阈值，所以它们没有骨架。
 *
 * API Token 那格非预取不可：它的表格用的是 useSuspenseQuery，而这条路由的子树
 * 外面没有 Suspense 边界，没预热就会在挂载时挂起、一路冒泡到根布局，把整个外壳
 * 变成空白。
 */
async function prefetchTab(
	context: RouterAppContext,
	tab: SettingsTab
): Promise<void> {
	if (tab !== TOKENS_TAB) {
		return;
	}
	await context.queryClient.ensureQueryData(
		context.orpc.apiTokens.list.queryOptions()
	);
}

/**
 * 与同目录其它路由同理：写在路由选项字面量外面，TypeScript 才能在检查同一字面量
 * 里的 `head` 之前推导出 loader 的返回类型。
 *
 * projects.get 这一条是父路由 route.tsx 的 loader 已经预取过的，这里再 ensure 一次
 * 只是从缓存里取项目名给标题用，不会多打一个往返。
 */
const settingsLoader = async ({
	context,
	deps,
	params,
}: {
	context: RouterAppContext;
	deps: { tab: SettingsTab | undefined };
	params: { projectId: string };
}): Promise<SettingsLoaderData> => {
	const project = await context.queryClient.ensureQueryData(
		context.orpc.projects.get.queryOptions({ input: { id: params.projectId } })
	);
	await prefetchTab(context, resolveSettingsTab(deps.tab));
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/settings")({
	component: ProjectSettingsPage,
	/*
	 * 标题写「项目名 · 设置」，形状与测试任务列表页那一份一致（见
	 * routes/projects/$projectId/test-runs/index.tsx）：项目名不能省，同时开着
	 * 两个项目的设置页时，两个标签页的标题一模一样，谁是谁只能靠挨个点开试。
	 * 不再细分到 tab——切 tab 只动 search，标题跟着变会让浏览器历史里多出几条
	 * 只差几个字的记录。
	 */
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.projectName ?? "项目"} · 设置 · 测试用例平台` },
		],
	}),
	loader: settingsLoader,
	/*
	 * tab 要算进 loader 依赖：预取按格分支，不把它算进来的话，切到「API Token」
	 * 时 loader 不会重跑，apiTokens.list 没预热，表格的 useSuspenseQuery 当场挂起，
	 * 外壳整块变白。这与测试任务列表页把 runStatus 算进依赖是同一类理由。
	 */
	loaderDeps: ({ search }) => ({ tab: search.tab }),
	pendingComponent: ProjectSettingsPending,
	validateSearch: settingsTabSearchSchema,
});

/*
 * phase 由两个调用方各自给出、不在 PageTransition 里写死：pending 与就绪是两个
 * 组件类型，路由换它们时必然卸载重挂，光靠 key 压不住，标注了才不会一跳淡入两次。
 *
 * 只补 main 这一层：外壳、顶栏与 Outlet 容器都由父路由 route.tsx 给出，pending
 * 渲染在 Outlet 的位置上，再套一层 ProjectShell 就成了两层外壳。
 */
function ProjectSettingsPending() {
	const tab = useSettingsTab();
	return (
		<PageTransition className={SETTINGS_MAIN} phase="pending">
			<SettingsTabs>
				<SettingsPendingPanel tab={tab} />
			</SettingsTabs>
		</PageTransition>
	);
}

function ProjectSettingsPage() {
	const { projectId } = Route.useParams();
	return (
		<PageTransition className={SETTINGS_MAIN} phase="ready">
			<SettingsTabs>
				<SettingsTabPanels projectId={projectId} />
			</SettingsTabs>
		</PageTransition>
	);
}
