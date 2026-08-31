import { createFileRoute } from "@tanstack/react-router";

import { PlatformUsersPage } from "@/components/platform-users/platform-users-page";
import { PlatformUsersPending } from "@/components/platform-users/platform-users-pending";
import { UsersShell } from "@/components/platform-users/users-shell";

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

function PlatformUsersRoute() {
	return (
		<UsersShell phase="ready">
			<PlatformUsersPage />
		</UsersShell>
	);
}
