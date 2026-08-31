/**
 * 平台用户管理页的加载态（路由的 pendingComponent），自 routes/users.tsx 拆出。
 * 壳与就绪态同一份，只有里面换成表格骨架。
 */
import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table-skeleton";
import { UsersShell } from "@/components/platform-users/users-shell";

export function PlatformUsersPending() {
	return (
		<UsersShell phase="pending">
			<PlatformUsersTableSkeleton />
		</UsersShell>
	);
}
