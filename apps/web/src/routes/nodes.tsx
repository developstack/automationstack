import { createFileRoute } from "@tanstack/react-router";

import { FarmNodesPage } from "@/components/farm-nodes/farm-nodes-page";
import { FarmNodesPending } from "@/components/farm-nodes/farm-nodes-pending";
import { NodesShell } from "@/components/farm-nodes/nodes-shell";

/**
 * 实机节点，**顶级**路由。
 *
 * 与 /users、/browsers（镜像库）并列而不挂在 /projects/$projectId 底下，理由同 routes/
 * browsers.tsx 那一段：项目那条父路由带着整套项目作用域的行李（presence 订阅、
 * 按 projectId 建的 WebSocket 频道、`viewFor()` 那一路视图作用域），而节点是
 * **跨项目**的算力清单——一台机器替谁跑会话与它属于哪个项目无关。塞进某个项目
 * 底下的话，它会莫名其妙地把自己算作那个项目的在场成员，而它展示的数据跟那个
 * 项目毫无关系。
 */
export const Route = createFileRoute("/nodes")({
	component: FarmNodesRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "节点 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取，与 /users、/browsers 同规：`farm.nodes.list` 是
		 * adminProcedure，非管理员的预取必然 FORBIDDEN，而那条失败会走 QueryCache
		 * 的全局错误 toast，把一条红色报错甩在「需要管理员权限」那张空态前面。
		 * 这一支比镜像库更没有悬念——整组六条全是 admin，不存在「万一 list
		 * 被放开」的那种不确定。auth.me 未登录返回 null，本身不会抛。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.farm.nodes.list.queryOptions()
			);
		}
	},
	pendingComponent: FarmNodesPending,
});

function FarmNodesRoute() {
	return (
		<NodesShell phase="ready">
			<FarmNodesPage />
		</NodesShell>
	);
}
