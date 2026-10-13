import { PageHeader } from "@/components/layout/page-header";
import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table-skeleton";
import { PLATFORM_USERS_TITLE } from "@/components/platform-users/platform-users-title";
import { UsersShell } from "@/components/platform-users/users-shell";

export function PlatformUsersPending() {
	return (
		<UsersShell phase="pending">
			<section className="flex flex-col gap-4">
				<PageHeader title={PLATFORM_USERS_TITLE} />
				<PlatformUsersTableSkeleton />
			</section>
		</UsersShell>
	);
}
