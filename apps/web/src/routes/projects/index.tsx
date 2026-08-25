import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
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
 * （窄列自己当滚动容器时的老毛病，成因见 plan 017，详文在 routes/members.tsx
 * 顶部，五页同一套）。
 *
 * 居中而不是左对齐：max-w-5xl 以外的余量在宽屏下会全堆到右边，卡片列贴着左缘、
 * 右侧空出一大片。mx-auto 把余量对半分。代价是内容左边缘不再与顶栏、侧栏的 px-4
 * gutter 同线（只有视口窄于 max-w 时才重合）——静态的边缘对齐让位给正文的落点，
 * 宽屏下后者更值钱；px-4 留着当窄屏的安全边距。
 * w-full 为什么不能省（横向 auto 外边距会关掉 flex 对子项的拉伸），见 routes/members.tsx
 * 顶部那段，五页同一套。
 *
 * 加载态与就绪态必须共用同一份 main 类名：两份类名迟早会各改各的（此前 pending
 * 就少了 overflow-y-auto），而它们之间任何一处差异都会在数据到达那一帧变成跳动。
 */
const PROJECTS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 顶栏不放页名：main 里已经有一个 h1「项目」，顶栏再放一个就是同页两个一级标题。
 * 于是 AppHeader 这里只剩窄屏那颗侧栏开关。
 *
 * phase 与 /members 同理，由两个调用方各自给出：标注了「骨架 → 就绪」这一跳才只
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
		<AppShell>
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
