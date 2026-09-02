import { createFileRoute } from "@tanstack/react-router";

import { BrowsersShell } from "@/components/farm-browsers/browsers-shell";
import { FarmBrowsersPage } from "@/components/farm-browsers/farm-browsers-page";
import { FarmBrowsersPending } from "@/components/farm-browsers/farm-browsers-pending";

/**
 * 镜像库（docker 后端的镜像目录），**顶级**路由。
 *
 * 路径仍是 /browsers 而界面上叫「镜像库」：改路径会作废所有已发出去的链接与
 * 书签，换来的只是地址栏里的一个词（同 farm-browsers-nav-item.tsx 那一段）。
 *
 * 与 /users 并列而不挂在 /projects/$projectId 底下，理由同 routes/users.tsx 那一段：
 * 项目那条父路由带着整套项目作用域的行李（presence 订阅、按 projectId 建的
 * WebSocket 频道、`viewFor()` 那一路视图作用域），而这张目录是**跨项目**的资源
 * 清单——农场能起哪些浏览器与哪个项目无关。塞进某个项目底下的话，它会莫名其妙
 * 地把自己算作那个项目的在场成员，而它展示的数据跟那个项目毫无关系。
 *
 */
export const Route = createFileRoute("/browsers")({
	component: FarmBrowsersRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "镜像库 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取，与 /users 同规：写目录的三条过程都是 adminProcedure，
		 * list 这一条按契约对所有登录用户开放，但**这一点是集成时才能核实的假设**。
		 * 万一它也被收紧成管理员专属，非管理员的预取就会失败、把一条红色 toast 甩
		 * 在「需要管理员权限」的空态前面。先判角色则两种契约下都不会出这一幕。
		 * auth.me 未登录返回 null，本身不会抛。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.farm.browsers.list.queryOptions()
			);
		}
	},
	pendingComponent: FarmBrowsersPending,
});

function FarmBrowsersRoute() {
	return (
		<BrowsersShell phase="ready">
			<FarmBrowsersPage />
		</BrowsersShell>
	);
}
