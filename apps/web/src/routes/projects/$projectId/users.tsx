import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { ProjectMembersTableSkeleton } from "@/components/project-members/project-members-table-skeleton";
import {
	PROJECT_MEMBERS_MAIN,
	ProjectMembersView,
} from "@/components/project-members/project-members-view";
import type { RouterAppContext } from "@/routes/__root";

interface ProjectUsersLoaderData {
	projectName: string;
}

/**
 * 预热成员名单与会话，另外把项目名带回来给 `head` 用。
 *
 * 三条各有非取不可的理由：
 * - `projectMembers.list` 是页面主体的 useSuspenseQuery，没预热就会在挂载时
 *   挂起，而这条路由的子树外面没有 Suspense 边界，挂起会一路冒泡到根布局、
 *   把整个外壳变成空白（同 overview.tsx 的理由）。
 * - `auth.me` 决定「操作控件画不画」。它多半已经在缓存里（根布局要靠它决定
 *   套不套外壳），这里 ensure 一次是为了不出现「先画出只读表格、会话到达后
 *   按钮才闪出来」的那一帧。它未登录时返回 null，本身不会抛。
 * - `projects.get` 是父路由 route.tsx 已经取过的，这里 ensure 只是从缓存里
 *   把名字拿到这一层——`head` 只能读本路由自己的 loaderData，够不到父路由的。
 *
 * 候选人（`projectMembers.listCandidates`）刻意不预取：它只有点开「添加成员」
 * 才用得上，而且只有管理得动的人才调得动，预取等于给每个普通成员都打一条注定
 * FORBIDDEN 的请求——那条失败会走 QueryCache 的全局错误 toast，人一进页面就先
 * 吃一条红字。
 *
 * 写在路由选项字面量外面，与同目录其它路由同理：TypeScript 才能在检查同一
 * 字面量里的 `head` 之前推导出 loader 的返回类型。
 */
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
	/*
	 * 标题形状与同目录的设置页一致：项目名不能省——同时开着两个项目的成员页时，
	 * 两个标签页的标题一模一样，谁是谁只能靠挨个点开试。
	 */
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.projectName ?? "项目"} · 成员 · 测试用例平台` },
		],
	}),
	loader: projectUsersLoader,
	pendingComponent: ProjectUsersPending,
});

/*
 * phase 由两个调用方各自给出、不在 PageTransition 里写死：pending 与就绪是两个
 * 组件类型，路由换它们时必然卸载重挂，光靠 key 压不住，标注了才不会一跳淡入两次。
 *
 * 只补 main 这一层：外壳、顶栏与 Outlet 容器都由父路由 route.tsx 给出，pending
 * 渲染在 Outlet 的位置上，再套一层 ProjectShell 就成了两层外壳。
 */
function ProjectUsersPending() {
	return (
		<PageTransition className={PROJECT_MEMBERS_MAIN} phase="pending">
			<ProjectMembersTableSkeleton />
		</PageTransition>
	);
}

function ProjectUsersPage() {
	const { projectId } = Route.useParams();
	return <ProjectMembersView projectId={projectId} />;
}
