import { createFileRoute } from "@tanstack/react-router";

import { caseListInput } from "@/components/cases/case-list-query";
import { CaseListSkeleton } from "@/components/cases/case-list-skeleton";
import {
	CASE_LIST_MAIN,
	CaseListView,
} from "@/components/cases/case-list-view";
import { PageTransition } from "@/components/layout/page-transition";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { workspaceSearchSchema } from "@/components/workspace/workspace-search";

/**
 * Declared outside the route options so TypeScript infers the loader deps
 * before it checks the (context-sensitive) `loader` in the same literal.
 *
 * 只取 moduleId，不取整个 search——这是本页手感的关键一条。loaderDeps 里的任何字段
 * 一变，路由就重跑 loader，超过 router.tsx 的 200ms 就把 pendingComponent 换上来，
 * 把整个 CaseListView 连同它 keepPreviousData 留住的那份数据一起卸载掉。取整个
 * search 的后果是：改筛选、翻页、甚至只是点开详情抽屉（caseId 也在 search 里），
 * 都会真表格 → 灰条骨架 → 真表格地闪一次，而 defaultPendingMinMs 还保证那一下
 * 至少停 300ms。
 *
 * 为什么这条线画在 moduleId 上：选模块是这一页的主导航，它换的是「在看哪一批用例」，
 * 让上一个模块的行留在新选中的模块标题下面是读错了；筛选、翻页、开抽屉都是对同一批
 * 用例的细化，上一份结果留着到新结果到达为止，读起来完全成立——那正是
 * case-list-view.tsx 里 keepPreviousData 一直想做、却被这里架空了的事。
 *
 * 代价（明确记下来）：URL 上直接带着筛选参数进来时（分享/收藏一个已筛选的视图），
 * loader 预取的是该模块未筛选的第一页，与组件真正要的那份 key 不同，会多一次请求，
 * 首屏由组件自己那份 CaseTableSkeleton（case-list-view.tsx 里 listQuery.data 为空
 * 的分支）兜住。这一档访问很少，换来的是每天几十上百次的页内操作不再闪。
 */
const caseListLoaderDeps = ({ search }: { search: WorkspaceSearch }) => ({
	moduleId: search.moduleId,
});

export const Route = createFileRoute("/projects/$projectId/")({
	component: CaseListPage,
	loader: ({ context, deps, params }) =>
		context.queryClient.ensureQueryData(
			context.orpc.cases.list.queryOptions({
				input: caseListInput(params.projectId, { moduleId: deps.moduleId }),
			})
		),
	loaderDeps: caseListLoaderDeps,
	pendingComponent: CaseListPending,
	validateSearch: workspaceSearchSchema,
});

/*
 * 为什么非要有这一份：loaderDeps 只取 moduleId（见上面 caseListLoaderDeps 的注释），
 * 所以切模块仍会重跑 loader，超过 router.tsx 的 200ms 阈值就得摆加载态。改筛选与翻页
 * 不再重跑 loader，它们的过渡由 case-table.tsx 的 STALE_CLASS 就地淡出接管。
 * 不摆加载态就落到兜底的整页 spinner
 * 上——一级侧栏、顶栏、二级面板整块消失，而 defaultPendingMinMs 还保证它至少停
 * 300ms，从模块树点一下看着像应用闪没了一次。
 *
 * 只补 main 这一层：外壳、顶栏、二级面板与 Outlet 容器都由父路由 route.tsx 给出，
 * pending 渲染在 Outlet 的位置上，再套一层 AppShell / ProjectShell 就成了两层外壳。
 *
 * 加载态与就绪态共用同一份 PageTransition 与 CASE_LIST_MAIN（就绪态在
 * case-list-view.tsx 里用的是同一个常量）：两份类名迟早会各改各的，而它们之间任何
 * 一处差异都会在数据到达那一帧变成跳动。
 *
 * phase="pending"：pending 与就绪是两个不同的组件类型，路由在两者之间切换必然卸载
 * 重挂，PageTransition 的 key={pathname} 拦不住（key 只在同一组件类型之间生效），
 * 不标注就会播两次进场——骨架淡入一次，数据到达再淡入一次。这一端负责登记「骨架
 * 正摆着」，就绪那一端（case-list-view.tsx 的 phase="ready"）据此跳过自己的进场。
 * 登记按 pathname 记，骨架亮着时点走的那种真·跨页导航仍会正常播进场。
 */
function CaseListPending() {
	return (
		<PageTransition className={CASE_LIST_MAIN} phase="pending">
			<CaseListSkeleton />
		</PageTransition>
	);
}

function CaseListPage() {
	const { projectId } = Route.useParams();
	return <CaseListView projectId={projectId} />;
}
