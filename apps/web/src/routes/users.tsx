import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";
import { PlatformUsersPage } from "@/components/platform-users/platform-users-page";
import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table";

/**
 * 平台用户管理，**顶级**路由。
 *
 * 不挂在 /projects/$projectId 底下，虽然那里也有一页叫「成员」：那条父路由带着
 * 整套项目作用域的行李——presence 订阅、按 projectId 建的 WebSocket 频道、
 * `viewFor()` 那一路视图作用域。这一页管的是**跨项目**的账号，硬塞进某个项目
 * 底下的话，它会莫名其妙地把自己算作那个项目的在场成员，而它展示的数据跟那个
 * 项目根本没关系。
 */
export const Route = createFileRoute("/users")({
	component: PlatformUsersRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "用户管理 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取：非管理员取 users.listWithProjects 必然 FORBIDDEN，那条
		 * 失败会走 QueryCache 的全局错误 toast，页面上的「需要管理员权限」还没读完
		 * 就被一条红色报错抢了话。auth.me 未登录返回 null，本身不会抛。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.users.listWithProjects.queryOptions()
			);
		}
	},
	pendingComponent: PlatformUsersPending,
});

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
function UsersShell({
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

function PlatformUsersPending() {
	return (
		<UsersShell phase="pending">
			<PlatformUsersTableSkeleton />
		</UsersShell>
	);
}

function PlatformUsersRoute() {
	return (
		<UsersShell phase="ready">
			<PlatformUsersPage />
		</UsersShell>
	);
}
