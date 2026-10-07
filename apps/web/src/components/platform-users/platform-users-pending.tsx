import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table-skeleton";
import { UsersShell } from "@/components/platform-users/users-shell";

export function PlatformUsersPending() {
	return (
		<UsersShell phase="pending">
			<PlatformUsersTableSkeleton />
		</UsersShell>
	);
}
