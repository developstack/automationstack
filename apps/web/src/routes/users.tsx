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
