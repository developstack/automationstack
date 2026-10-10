import { createFileRoute } from "@tanstack/react-router";

import { PlatformUsersPage } from "@/components/platform-users/platform-users-page";
import { PlatformUsersPending } from "@/components/platform-users/platform-users-pending";
import { UsersShell } from "@/components/platform-users/users-shell";

export const Route = createFileRoute("/users")({
	component: PlatformUsersRoute,
	head: () => ({ meta: [{ title: "用户管理 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			// 认证方式决定 Casdoor 用户的操作是否锁定。读取失败时不锁定，由服务端检查。
			await Promise.all([
				context.queryClient.ensureQueryData(
					context.orpc.users.listWithProjects.queryOptions()
				),
				context.queryClient.prefetchQuery(
					context.orpc.auth.config.queryOptions()
				),
			]);
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
