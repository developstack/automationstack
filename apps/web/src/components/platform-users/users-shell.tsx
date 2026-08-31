/**
 * 平台用户管理页的外壳，自 routes/users.tsx 拆出。
 * 加载态与就绪态两个调用方（platform-users-pending.tsx 与那份路由文件里的
 * PlatformUsersRoute）共用这一层，两态之间不会有任何布局差异。
 */
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

/*
 * 两层结构，与项目列表页同一套：main 满宽当滚动容器，居中的内容列在内层 div——
 * 滚动条因此贴视口右缘，而不是挂在这条窄列的右缘（窄列自己当滚动容器时的老毛病，
 * 成因见 plan 017）。
 *
 * max-w-5xl 与项目列表页取同一档：这两页共用一条侧栏，来回切时内容列的左右边缘
 * 不该跟着动一下。这一页比当年的 /members 多了「所属项目」一列，4xl 会把那一列
 * 挤到每行都换行。
 *
 * 加载态与就绪态必须共用同一份 main 类名：两份类名迟早会各改各的，而它们之间
 * 任何一处差异都会在数据到达那一帧变成跳动。
 */
const USERS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 页名放顶栏：这一页的 main 里没有自己的 h1（项目列表页反过来，h1 在 ProjectList
 * 里，所以那一页的顶栏是空的）。两页的顶栏都是同一个 AppHeader、同一个 min-h-12，
 * 来回切时顶栏不会跳——这正是把项目列表页从裸壳换成 AppShell 换来的。
 *
 * phase 由两个调用方各自给出、不在这里写死：pending 与就绪是两个组件类型，路由
 * 换它们时必然卸载重挂，PageTransition 光靠 key 压不住，标注了才不会一跳淡入两次。
 * 写死成 "ready" 会把「数据已在缓存里、根本没走 pending」的那种秒开导航也一起吞掉。
 */
export function UsersShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell sidebar={<PlatformSidebar />}>
			<AppHeader>
				<h1 className="font-medium text-sm">用户管理</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={USERS_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}
