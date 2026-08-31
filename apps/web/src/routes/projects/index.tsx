import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";
import {
	ProjectList,
	ProjectListSkeleton,
} from "@/components/projects/project-list";

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

/*
 * 两层结构：main 满宽当滚动容器，居中的内容列（mx-auto、w-full、max-w-5xl、
 * px-4、py-6）在内层 div——滚动条因此贴视口右缘，而不是挂在这条窄列的右缘
 * （窄列自己当滚动容器时的老毛病，成因见 plan 017，/users 顶部有同一套推导）。
 *
 * 居中而不是左对齐：max-w-5xl 以外的余量在宽屏下会全堆到右边，卡片列贴着左缘、
 * 右侧空出一大片。mx-auto 把余量对半分。代价是内容左边缘不再与顶栏、侧栏的 px-4
 * gutter 同线（只有视口窄于 max-w 时才重合）——静态的边缘对齐让位给正文的落点，
 * 宽屏下后者更值钱；px-4 留着当窄屏的安全边距。
 * w-full 为什么不能省：这组类名与 mx-auto 结成一对，宽度恒为 min(100%, max-w)，
 * 少了它横向 auto 外边距会关掉 flex 对子项的拉伸，窄屏下白缩一截。
 *
 * 加载态与就绪态必须共用同一份 main 类名：两份类名迟早会各改各的（此前 pending
 * 就少了 overflow-y-auto），而它们之间任何一处差异都会在数据到达那一帧变成跳动。
 */
const PROJECTS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 这一页现在有侧栏了，而且是它把侧栏带回来的。
 *
 * ── 当初为什么认为不该有 ──
 * 这一页原先用的是一层裸壳（components/layout/plain-shell.tsx，已随本次改动删
 * 除）。那份文件的论证是：侧栏装的是「在某个作用域内部走动」的导航，而选项目这
 * 一步还没有作用域可言，侧栏里能放的只有它自己那一项；一条只指向当前页的导航既
 * 占掉 16rem，又让人以为还有别处可去。在当时那是对的——那会儿平台层确实只有这
 * 一页。
 *
 * ── 现在为什么变了 ──
 * 平台层长出了第二个去处：/users（整个平台的用户管理）。「项目」与「用户」是同
 * 一层里的两站，这正是一级侧栏该装的东西，前提「只有一项」不再成立，结论跟着翻
 * 过来。侧栏本身是 PlatformSidebar，与项目内那条 ProjectSidebar 并列，各管一个
 * 作用域。
 *
 * 顺带收回一笔债：裸壳没有侧栏就没有 SidebarUser，而登出、切主题、当前用户全在
 * 那颗菜单里，于是它只好在顶栏另写了一份 PlainShellUserMenu。换成 AppShell 之后
 * SidebarUser 回来了，那份重复实现随文件一起消失——全站的账户出口重新收敛回
 * sidebar-user.tsx 一处，两处菜单再也不会各改各的。
 *
 * 顶栏不放页名：main 里已经有一个 h1「项目」，顶栏再放一个就是同页两个一级标题。
 * 于是宽屏下这条 AppHeader 是空的，它仍然不能省：窄屏的侧栏是整块滑走的抽屉，
 * AppHeader 里那颗 SidebarTrigger 是把它叫回来的唯一入口；而且 /users 的顶栏有页
 * 名、这一页没有，两边同为 min-h-12 才不会在切页时跳一下。
 *
 * phase 与 /users 同理，由两个调用方各自给出：标注了「骨架 → 就绪」这一跳才只
 * 淡入一次；写死成 "ready" 则连没走 pending 的秒开导航也不再有进场。
 */
function ProjectsShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell sidebar={<PlatformSidebar />}>
			<AppHeader />
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={PROJECTS_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}

function ProjectsPending() {
	return (
		<ProjectsShell phase="pending">
			<ProjectListSkeleton />
		</ProjectsShell>
	);
}

function ProjectsPage() {
	return (
		<ProjectsShell phase="ready">
			<ProjectList />
		</ProjectsShell>
	);
}
